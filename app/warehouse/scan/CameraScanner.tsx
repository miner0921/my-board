"use client";

import { useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────
// 카메라 바코드 스캐너 — @zxing/browser 로 후면 카메라 영상에서 1D 바코드 디코드.
//   - 단계 분리: (A) getUserMedia 로 스트림 확보 → (B) zxing 이 그 스트림을 디코드.
//     어느 단계에서 실패했는지(stage)와 error.name/message 를 화면에 그대로 표시(진단).
//   - 후면 카메라는 exact 가 아니라 ideal(선호). 실패하면 제약 없이(video:true) 재시도.
//   - 마운트 시 start, 언마운트 시 디코딩 중단 + 스트림 트랙 stop(리소스 정리).
//   - zxing 은 동적 import(브라우저 전용) — SSR 에서 로드되지 않게.
// ─────────────────────────────────────────────────────────────

type Props = {
  onDetected: (text: string) => void;
};

type ErrorInfo = { stage: string; name: string; message: string };

export default function CameraScanner({ onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);

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
    let stage = "init";

    (async () => {
      try {
        const video = videoRef.current;
        if (!video || cancelled) return;

        // ── (A) getUserMedia — 후면 선호(ideal), 실패하면 제약 없이 폴백 ──
        stage = "getUserMedia";
        if (!navigator.mediaDevices?.getUserMedia) {
          // 비보안 컨텍스트(http) / 미지원 브라우저 등
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
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

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
        controls = await reader.decodeFromStream(stream, video, (result) => {
          if (result) onDetectedRef.current(result.getText());
        });
        if (cancelled) controls.stop();
      } catch (e) {
        const err = e as { name?: string; message?: string };
        console.error("카메라 시작 실패:", stage, e);
        if (!cancelled) {
          setErrorInfo({
            stage,
            name: err?.name ?? "Error",
            message: err?.message ?? String(e),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      controls?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  if (errorInfo) {
    return (
      <div className="aspect-[2/1] w-full rounded-lg bg-zinc-100 border border-dashed border-zinc-300 flex flex-col items-center justify-center px-4 text-center">
        <p className="text-sm text-zinc-600">
          카메라를 쓸 수 없습니다. 바코드를 직접 입력하세요.
        </p>
        {/* 진단용 — 폰에서 실제 원인을 눈으로 볼 수 있게 단계 + error.name/message 표시 */}
        <p className="mt-1 text-[11px] text-zinc-400 break-all">
          [{errorInfo.stage}] {errorInfo.name}: {errorInfo.message}
        </p>
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
