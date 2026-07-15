"use client";

import { useEffect, useRef, useState } from "react";
import { type FlashKind } from "./useScanSession";

// ─────────────────────────────────────────────────────────────
// 카메라 바코드 스캐너 — @zxing/browser 로 후면 카메라 영상에서 1D 바코드 디코드.
//   - 권한 상태(Permissions API)를 먼저 읽어 탭 횟수를 최소화한다.
//     · granted → 탭 없이 자동 시작(권한이 있으면 팝업 없이 즉시 stream 확보)
//     · prompt  → "탭하여 카메라 켜기" 버튼(그 클릭 핸들러 안에서 getUserMedia)
//     · denied  → 버튼으로는 못 푼다. 자물쇠 → 권한 → 카메라 초기화 안내.
//     · query 미지원(Firefox·iOS Safari)은 prompt 로 간주 — 기존 동작대로 열화.
//   - ★ 권한 변경(onchange) 구독: 사용자가 팝업에서 허용한 순간 granted 로 바뀌며
//     자동으로 카메라가 켜진다. 실패해도 사용자가 다시 탭할 필요가 없다.
//   - ★ 폴백은 NotAllowedError 를 배제한다. 권한 거부 뒤의 두 번째 getUserMedia 는
//     사용자 제스처(transient activation)를 잃은 새 권한 요청이라 팝업 없이 거부되어
//     실패를 굳힌다. 제약·장치 문제(OverconstrainedError 등)일 때만 video:true 로 재시도.
//   - 단계 분리: (A) getUserMedia 로 스트림 확보 + video 표시 → (B) zxing 이 그 스트림을 디코드.
//     스트림은 확보 즉시 video 에 물려 zxing 로드를 기다리지 않는다.
//   - 언마운트 시 디코딩 중단 + 스트림 트랙 stop. 비동기 진행 중 언마운트되면
//     뒤늦게 도착한 스트림·디코더도 즉시 정리한다(useIsMobile 뷰 전환 등).
//   - video 요소는 항상 렌더(ref 확보). 시작 전에는 그 위에 오버레이.
//   - zxing 은 동적 import(브라우저 전용) — SSR 에서 로드되지 않게.
// ─────────────────────────────────────────────────────────────

type Props = {
  onDetected: (text: string) => void;
  // 스캔 성공/완료 시 프리뷰에 초록 테두리를 짧게 띄우기 위한 신호.
  // 세션의 flash 상태를 그대로 받는다(사라짐은 세션 타이머에 맡김).
  flash: FlashKind;
};

type ErrorInfo = { stage: string; name: string; message: string };

// 브라우저 카메라 권한 상태. query 미지원이면 "prompt" 로 취급한다.
type PermState = "granted" | "prompt" | "denied";

export default function CameraScanner({ onDetected, flash }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [started, setStarted] = useState(false);
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);
  const [permState, setPermState] = useState<PermState>("prompt");

  // 시작 중복 방지 — 자동 시작(마운트·onchange)과 사용자 탭이 겹칠 수 있다.
  const startingRef = useRef(false);
  // 마운트 여부 — await 도중 언마운트되면 뒤늦게 온 스트림을 버려야 한다.
  const mountedRef = useRef(true);

  // onDetected 를 ref 로 잡아 항상 최신 콜백을 쓴다(렌더 중이 아니라 effect 에서 동기화).
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  });

  // 카메라 권한 상태 조회. 미지원(Firefox·iOS Safari)이면 null → 호출 측이 prompt 로 간주.
  const queryPermission = async (): Promise<PermissionStatus | null> => {
    try {
      return await navigator.permissions.query({
        name: "camera" as PermissionName,
      });
    } catch {
      return null;
    }
  };

  const startCamera = async () => {
    // 이미 시작 중이거나 스트림이 살아 있으면 재진입하지 않는다.
    if (startingRef.current || streamRef.current) return;
    startingRef.current = true;

    setErrorInfo(null);
    setStarted(true); // 오버레이 숨김 + video 표시(video 는 항상 렌더라 ref 는 이미 있음)
    let stage = "init";
    try {
      const video = videoRef.current;
      if (!video) return;

      // ── (A) getUserMedia — 후면 선호(ideal) ──
      stage = "getUserMedia";
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new DOMException(
          "navigator.mediaDevices.getUserMedia 를 쓸 수 없습니다(비보안 컨텍스트 또는 미지원).",
          "NotSupportedError"
        );
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
      } catch (e1) {
        // 권한 거부면 재요청하지 않는다 — 제스처를 잃은 두 번째 요청은 팝업 없이
        // 거부되어 실패를 굳힌다. 제약·장치 문제일 때만 제약 없이 재시도.
        if ((e1 as Error)?.name === "NotAllowedError") throw e1;
        stage = "getUserMedia(fallback video:true)";
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      // await 도중 언마운트됐다면 붙이지 말고 즉시 정리(언마운트 cleanup 은 이미 지나갔다).
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;

      // 스트림 확보 즉시 video 에 물려 영상을 바로 보여준다(zxing 로드를 기다리지 않음).
      // decodeFromStream 도 내부에서 같은 스트림을 다시 붙이지만 무해하다.
      stage = "attachVideo";
      video.srcObject = stream;
      // autoPlay 속성이 있지만 일부 브라우저는 명시적 play() 가 필요 — 실패는 무시(디코드에는 영향 없음).
      await video.play().catch(() => {});

      // ── (B) zxing — 확보한 스트림을 디코드 ──
      stage = "zxing";
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const { DecodeHintType, BarcodeFormat } = await import("@zxing/library");

      // 흔한 1D 심볼로지 전부 허용(특정 형식으로 좁히지 않음).
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.CODE_93,
        BarcodeFormat.ITF,
        BarcodeFormat.CODABAR,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      const reader = new BrowserMultiFormatReader(hints);
      const controls = await reader.decodeFromStream(stream, video, (result) => {
        if (result) onDetectedRef.current(result.getText());
      });
      // 디코더를 붙이는 사이 언마운트됐다면 바로 중단.
      if (!mountedRef.current) {
        controls.stop();
        return;
      }
      controlsRef.current = controls;
    } catch (e) {
      const err = e as { name?: string; message?: string };
      setErrorInfo({
        stage,
        name: err?.name ?? "Error",
        message: err?.message ?? String(e),
      });

      // 권한 거부라면 다시 물어볼 수 있는 상태(prompt)인지 영구 거부(denied)인지 확인.
      // denied 면 버튼을 눌러도 팝업이 뜨지 않으므로 안내 UI 로 바꿔야 한다.
      if (err?.name === "NotAllowedError") {
        const status = await queryPermission();
        if (status && mountedRef.current) setPermState(status.state as PermState);
      }

      // 실패 시 오버레이를 다시 보이게 하고 잔여 스트림 정리.
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setStarted(false);
    } finally {
      startingRef.current = false;
    }
  };

  // effect 가 startCamera 를 의존성으로 잡아 재구독되지 않도록 ref 로 우회.
  // (렌더 중이 아니라 effect 에서 동기화 — onDetectedRef 와 같은 방식)
  const startCameraRef = useRef(startCamera);
  useEffect(() => {
    startCameraRef.current = startCamera;
  });

  // 마운트 시 권한 확인 → granted 면 탭 없이 자동 시작.
  // 권한 변경 구독 → 팝업에서 "허용"한 순간 granted 로 바뀌며 자동 시작(재탭 불필요).
  // 언마운트 시 디코딩 중단 + 스트림 트랙 정리.
  useEffect(() => {
    mountedRef.current = true;
    let status: PermissionStatus | null = null;

    const handleChange = () => {
      if (!status || !mountedRef.current) return;
      const next = status.state as PermState;
      setPermState(next);
      if (next === "granted") void startCameraRef.current();
    };

    void (async () => {
      status = await queryPermission();
      if (!status || !mountedRef.current) return; // 미지원 → prompt 유지
      setPermState(status.state as PermState);
      status.addEventListener("change", handleChange);
      if (status.state === "granted") void startCameraRef.current();
    })();

    return () => {
      mountedRef.current = false;
      status?.removeEventListener("change", handleChange);
      controlsRef.current?.stop();
      controlsRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // 오버레이 분기: 영구 거부 > 권한 거부(재시도 가능) > 기타 실패 > 최초 진입.
  const isDenied = permState === "denied";
  const isPermissionError = errorInfo?.name === "NotAllowedError";

  return (
    <div className="relative aspect-[2/1] w-full rounded-lg overflow-hidden bg-black">
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        playsInline
        muted
        autoPlay
      />
      {/* 스캔 성공/완료 시 초록 테두리 — 탭 방해 금지(pointer-events-none),
          사라짐은 세션의 기존 350ms flash 타이머에 맡긴다(여기서 타이머 안 만듦). */}
      {(flash === "ok" || flash === "complete") && (
        <div className="pointer-events-none absolute inset-0 rounded-lg ring-4 ring-green-400" />
      )}
      {!started &&
        (isDenied ? (
          // 영구 거부 — 눌러도 팝업이 뜨지 않는다. 버튼 대신 해제 방법을 안내.
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-zinc-100 border border-dashed border-zinc-300 px-4 text-center text-zinc-500">
            <span className="text-2xl" aria-hidden>
              🔒
            </span>
            <span className="text-sm font-medium text-zinc-700">
              카메라 권한이 차단되어 있습니다
            </span>
            <span className="text-xs leading-relaxed">
              주소창 왼쪽 자물쇠 → 권한 → 카메라를 초기화한 뒤
              <br />이 페이지를 새로고침해 주세요.
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void startCamera()}
            className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-zinc-100 border border-dashed border-zinc-300 px-4 text-center text-zinc-500"
          >
            <span className="text-2xl" aria-hidden>
              📷
            </span>
            {isPermissionError ? (
              // 권한 거부지만 다시 물어볼 수 있다 — 이 버튼 클릭이 새 제스처가 된다.
              <>
                <span className="text-sm font-medium text-zinc-700">
                  카메라 권한이 꺼져 있습니다
                </span>
                <span className="rounded bg-zinc-700 px-3 py-1 text-xs font-medium text-white">
                  다시 허용하기
                </span>
              </>
            ) : errorInfo ? (
              <>
                <span className="text-sm">
                  카메라를 쓸 수 없습니다. 다시 시도하려면 탭하세요.
                </span>
                {/* 진단용 — 실제 원인(단계 + error.name/message) 표시 */}
                <span className="text-[11px] text-zinc-400 break-all">
                  [{errorInfo.stage}] {errorInfo.name}: {errorInfo.message}
                </span>
              </>
            ) : (
              // 최초 진입 — 권한 요청 전. 탭 대상임이 한눈에 보이도록 CTA 로 강조하고,
              // 탭하면 권한 창이 뜬다는 걸 보조 문구로 예고한다.
              <>
                <span className="rounded-lg bg-zinc-700 px-6 py-3 text-base font-semibold text-white shadow-sm">
                  탭하여 스캔 시작
                </span>
                <span className="mt-1.5 text-xs text-zinc-500">
                  카메라 권한 창이 뜨면 &apos;허용&apos;을 눌러 주세요
                </span>
              </>
            )}
          </button>
        ))}
    </div>
  );
}
