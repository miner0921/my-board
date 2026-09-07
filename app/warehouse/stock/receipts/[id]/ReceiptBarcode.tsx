"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

// 입고증 번호를 Code128 바코드로 그린다(인쇄용).
// 현장 스캐너가 이 바코드를 찍으면 /warehouse/stock/receive 에서 예정 품목이 뜬다.
export default function ReceiptBarcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    JsBarcode(ref.current, value, {
      format: "CODE128",
      displayValue: true,
      fontSize: 16,
      height: 60,
      margin: 8,
    });
  }, [value]);

  return <svg ref={ref} className="max-w-full" />;
}
