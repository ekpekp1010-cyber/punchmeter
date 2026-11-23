"use client";
// Design Ref: §5.3 ExportButtons — CSV·PDF 내려받기 (PLAN 작업 20·21)
// 둘 다 브라우저 안에서 만든다 (서버로 보내지 않음). PDF는 브라우저 인쇄 창의 "PDF로 저장"을 쓴다.

interface Props {
  disabled: boolean;
  onCsv: () => void;
  onPdf: () => void;
}

export default function ExportButtons({ disabled, onCsv, onPdf }: Props) {
  const cls =
    "rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={onCsv} disabled={disabled} className={cls}>
        ⬇ CSV 내려받기
      </button>
      <button type="button" onClick={onPdf} disabled={disabled} className={cls}>
        ⬇ PDF로 저장
      </button>
      <span className="text-[10px] text-zinc-500">
        PDF는 인쇄 창이 열리면 &ldquo;대상&rdquo;을 &ldquo;PDF로 저장&rdquo;으로 골라 주세요.
      </span>
    </div>
  );
}
