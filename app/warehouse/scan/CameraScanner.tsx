"use client";

import { useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────
// 카메라 바코드 스캐너 — @zxing/browser 로 후면 카메라 영상에서 1D 바코드 디코드.
//   - 마운트 시 카메라 start, 언마운트 시 track stop(리소스 정리).
//   - 디코드되면 onDetected(text) 콜백으로 넘긴다(연결은 상위 뷰가 담당).
//   - 권한 거부 / 카메라 없음 → 에러 대신 안내 표시, 텍스트 입력칸으로 폴백.
//   - zxing 은 동적 import(브라우저 전용) — SSR 에서 로드되지 않게 한다.
//   - facingMode: environment 는 "선호"(exact 아님)라 후면 카메라 없는 데스크톱은
//     사용 가능한 카메라로 자동 폴백된다.
// ─────────────────────────────────────────────────────────────

type Props = {
  onDetected: (text: string) => void;
};

export default function CameraScanner({ onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // onDetected 를 ref 로 잡아, 콜백이 바뀌어도 카메라 effect 재실행(재시작) 없이
  //   항상 최신 콜백을 쓴다. (렌더 중이 아니라 effect 에서 동기화)
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  });

  useEffect(() => {
    // IScannerControls (stop 으로 디코딩 중단 + 스트림 해제)
    let controls: { stop: () => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        // 브라우저 전용 — 동적 import 로 SSR 회피 + 코드 스플릿(모바일에서만 로드).
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
        const video = videoRef.current;
        if (!video || cancelled) return;

        controls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          video,
          (result) => {
            if (result) onDetectedRef.current(result.getText());
          }
        );
        // 시작 완료 직전에 언마운트됐으면 즉시 정리.
        if (cancelled) controls.stop();
      } catch (e) {
        console.error("카메라 시작 실패:", e);
        if (!cancelled) {
          setErrorMsg("카메라를 쓸 수 없습니다. 바코드를 직접 입력하세요.");
        }
      }
    })();

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, []);

  if (errorMsg) {
    return (
      <div className="aspect-[2/1] w-full rounded-lg bg-zinc-100 border border-dashed border-zinc-300 flex items-center justify-center px-4 text-center text-zinc-500 text-sm">
        {errorMsg}
      </div>
    );
  }

  return (
    <div className="aspect-[2/1] w-full rounded-lg overflow-hidden bg-black">
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        playsInline
        muted
        autoPlay
      />
    </div>
  );
}
