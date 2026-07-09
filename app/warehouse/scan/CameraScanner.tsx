"use client";

import { useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────
// 카메라 바코드 스캐너 — @zxing/browser 로 후면 카메라 영상에서 1D 바코드 디코드.
//   - ★ 자동 시작하지 않는다. 사용자가 "탭하여 카메라 켜기"를 누르면 그 클릭
//     핸들러 안에서 어떤 await(zxing 동적 import 등)보다 "가장 먼저" getUserMedia 를
//     호출한다(제스처 직후라 크롬이 허용). 스트림은 확보 즉시 video 에 물려
//     영상이 바로 보이게 하고, 그 다음에 zxing 을 로드해 디코더를 붙인다.
//   - 단계 분리: (A) getUserMedia 로 스트림 확보 + video 표시 → (B) zxing 이 그 스트림을 디코드.
//     실패 시 단계(stage)와 error.name/message 를 그대로 표시(진단).
//   - 후면 카메라는 exact 가 아니라 ideal(선호). 실패하면 제약 없이(video:true) 재시도.
//   - 언마운트 시 디코딩 중단 + 스트림 트랙 stop(리소스 정리).
//   - video 요소는 항상 렌더(ref 확보). 시작 전에는 그 위에 "켜기" 오버레이 버튼.
//   - zxing 은 동적 import(브라우저 전용) — SSR 에서 로드되지 않게.
// ─────────────────────────────────────────────────────────────

type Props = {
  onDetected: (text: string) => void;
};

type ErrorInfo = { stage: string; name: string; message: string };

export default function CameraScanner({ onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [started, setStarted] = useState(false);
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);

  // onDetected 를 ref 로 잡아 항상 최신 콜백을 쓴다(렌더 중이 아니라 effect 에서 동기화).
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  });

  // 언마운트 시 디코딩 중단 + 스트림 트랙 정리.
  useEffect(() => {
    return () => {
      controlsRef.current?.stop();
      controlsRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // ★ 사용자 제스처(탭) 안에서 호출 — 제스처 직후 getUserMedia 라 크롬이 허용.
  const startCamera = async () => {
    setErrorInfo(null);
    setStarted(true); // 오버레이 숨김 + video 표시(video 는 항상 렌더라 ref 는 이미 있음)
    let stage = "init";
    try {
      const video = videoRef.current;
      if (!video) return;

      // ── (A) getUserMedia — 후면 선호(ideal), 실패하면 제약 없이 폴백 ──
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
      } catch {
        // 후면 지정/제약이 원인일 수 있으니 제약 없이 재시도(아무 카메라나).
        stage = "getUserMedia(fallback video:true)";
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
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
      controlsRef.current = await reader.decodeFromStream(
        stream,
        video,
        (result) => {
          if (result) onDetectedRef.current(result.getText());
        }
      );
    } catch (e) {
      const err = e as { name?: string; message?: string };
      console.error("카메라 시작 실패:", stage, e);
      setErrorInfo({
        stage,
        name: err?.name ?? "Error",
        message: err?.message ?? String(e),
      });
      // 실패 시 오버레이(탭하여 재시도)를 다시 보이게 하고 잔여 스트림 정리.
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setStarted(false);
    }
  };

  return (
    <div className="relative aspect-[2/1] w-full rounded-lg overflow-hidden bg-black">
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        playsInline
        muted
        autoPlay
      />
      {!started && (
        <button
          type="button"
          onClick={() => void startCamera()}
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-zinc-100 border border-dashed border-zinc-300 px-4 text-center text-zinc-500"
        >
          <span className="text-2xl" aria-hidden>
            📷
          </span>
          {errorInfo ? (
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
            <span className="text-sm font-medium">탭하여 카메라 켜기</span>
          )}
        </button>
      )}
    </div>
  );
}
