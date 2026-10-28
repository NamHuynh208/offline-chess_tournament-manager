"use client";
// Nhập kết quả (FR-04) -> trọng tài kiểm tra lại -> kiosk cho 2 kỳ thủ xác nhận lần lượt (FR-05, FR-06)
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Hand, ShieldAlert, WifiOff, XCircle } from "lucide-react";
import type { ResultType } from "@prisma/client";
import type { ClientMatch } from "@/lib/matches";
import { readyToPublish, SIDE_LABEL, toState, type RecorderAction, type Side } from "@/lib/match-state";
import { RESULT_DISPLAY } from "@/lib/results";
import { ConfirmMarks, PieceDot, PlayerLine, StatusBadge } from "./ui";

type Step = "detail" | "review" | "WHITE" | "handoff" | "BLACK" | "done" | "exception";
const KIOSK_STEPS: Step[] = ["WHITE", "handoff", "BLACK", "done"];
const MAIN: ResultType[] = ["WHITE_WIN", "DRAW", "BLACK_WIN"];
const SPECIAL: ResultType[] = ["BLACK_FORFEIT", "WHITE_FORFEIT", "DOUBLE_FORFEIT", "BYE"];
const QUICK_REASONS = ["Kỳ thủ thua đã rời khu vực thi đấu", "Kỳ thủ vắng mặt, không thể xác nhận", "Kỳ thủ không chịu bấm xác nhận", "Điện thoại trọng tài gặp sự cố"];

type Props = {
  match: ClientMatch;
  brand: string;
  /** còn thao tác của ván này chưa gửi được lên máy chủ */
  pendingSync: boolean;
  offline: boolean;
  dispatch: (a: RecorderAction, label: string) => string | null;
  onClose: () => void;
};

export default function ResultFlow({ match: m, brand, pendingSync, offline, dispatch, onClose }: Props) {
  const [step, setStep] = useState<Step>("detail");
  const [chosen, setChosen] = useState<ResultType | null>(null);
  const [error, setError] = useState("");
  const [exceptionFromKiosk, setExceptionFromKiosk] = useState(false);
  const go = (s: Step) => {
    setError("");
    setStep(s);
  };
  /** chạy thao tác; lỗi thì hiện ngay trên màn hình hiện tại */
  const run = (a: RecorderAction, label: string, next: Step) => {
    const err = dispatch(a, label);
    if (err) setError(err);
    else go(next);
    return !err;
  };

  const editable = ["PENDING_RESULT", "AWAITING_CONFIRMATION", "REOPENED"].includes(m.status);
  const awaitingPublication = readyToPublish(toState(m));
  const canContinue = m.status === "AWAITING_CONFIRMATION" && !!m.result && !awaitingPublication;
  const canRequestException = ["AWAITING_CONFIRMATION", "DISPUTED"].includes(m.status) && !!m.result;
  const label = `Bàn ${m.board}`;

  let content: React.ReactNode;
  if (step === "detail") {
    content = (
      <Sheet title={label} onBack={onClose} backLabel="Danh sách">
        <div className="app-card flex flex-col gap-3 rounded-sm p-4">
          <PlayerLine side="WHITE" p={m.white} />
          <PlayerLine side="BLACK" p={m.black} />
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <StatusBadge status={m.status} />
            <span className="text-2xl font-bold">{m.result ? RESULT_DISPLAY[m.result].score : "–"}</span>
          </div>
          <ConfirmMarks m={m} />
          {m.exceptionReason && <p className="rounded-sm bg-amber-50 p-3 text-amber-900">Đã yêu cầu TTKT duyệt ngoại lệ: {m.exceptionReason}</p>}
        </div>

        {m.status === "DISPUTED" && <Note tone="red">Có bất đồng – chờ Trọng tài kỹ thuật xử lý. Kết quả chưa được công bố.</Note>}
        {m.status === "OFFICIAL" && <Note tone="green">Kết quả đã chính thức. Muốn sửa cần Trọng tài kỹ thuật mở lại.</Note>}
        {awaitingPublication && <Note tone="green">Đã đủ xác nhận kỳ thủ — chờ Trọng tài kỹ thuật duyệt công bố.</Note>}

        {canContinue && (
          <BigButton className="bg-sky-600 text-white" onClick={() => go(m.whiteConfirmedAt ? "handoff" : "WHITE")}>
            Tiếp tục cho kỳ thủ xác nhận
          </BigButton>
        )}

        {editable && (
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">{m.result ? "Nhập lại kết quả" : "Chọn kết quả"}</h2>
            <div className="grid grid-cols-3 gap-2">
              {MAIN.map((r) => (
                <ResultOption key={r} r={r} disabled={!m.black} onPick={() => (setChosen(r), go("review"))} big />
              ))}
            </div>
            <h3 className="font-semibold text-slate-600">Trường hợp đặc biệt</h3>
            <div className="grid grid-cols-2 gap-2">
              {SPECIAL.map((r) => (
                <ResultOption key={r} r={r} disabled={(r === "BYE") === !!m.black} onPick={() => (setChosen(r), go("review"))} />
              ))}
            </div>
          </section>
        )}

        {canRequestException && (
          <button onClick={() => (setExceptionFromKiosk(false), go("exception"))} className="flex h-14 items-center justify-center gap-2 rounded-sm border-2 border-amber-500 font-semibold text-amber-800">
            <ShieldAlert size={20} /> Yêu cầu Trọng tài kỹ thuật duyệt ngoại lệ
          </button>
        )}
      </Sheet>
    );
  } else if (step === "review" && chosen) {
    content = (
      <Sheet title="Trọng tài kiểm tra lại" onBack={() => go("detail")} backLabel="Chọn lại">
        <div className="app-card flex flex-col gap-5 rounded-sm p-5" style={{ borderTop: `3px solid ${brand}` }}>
          <div className="text-center text-xl font-bold text-slate-500">{label}</div>
          <ReviewSide side="WHITE" name={m.white.fullName} sno={m.white.startNo} />
          {m.black ? <ReviewSide side="BLACK" name={m.black.fullName} sno={m.black.startNo} /> : <div className="text-xl italic text-slate-500">Không có kỳ thủ Đen (miễn đấu)</div>}
          <div className="rounded-sm bg-slate-900 p-4 text-center text-white">
            <div className="text-sm tracking-wide uppercase opacity-70">Kết quả</div>
            <div className="text-6xl font-black tabular-nums">{RESULT_DISPLAY[chosen].score}</div>
            <div className="mt-1 text-xl font-semibold">{RESULT_DISPLAY[chosen].text}</div>
          </div>
        </div>
        {error && <Note tone="red">{error}</Note>}
        <BigButton className="bg-sky-600 text-white" onClick={() => run({ type: "ENTER_RESULT", result: chosen }, `${label}: nhập ${RESULT_DISPLAY[chosen].score}`, "WHITE")}>
          <Hand size={24} /> Chuyển cho kỳ thủ xác nhận
        </BigButton>
        <button onClick={() => go("detail")} className="h-14 rounded-sm bg-slate-100 font-semibold text-slate-700">
          Chọn lại
        </button>
      </Sheet>
    );
  } else if (step === "WHITE" || step === "BLACK") {
    const side = step;
    const p = side === "WHITE" ? m.white : m.black!;
    content = (
      <PlayerTurn
        key={side}
        side={side}
        name={p.fullName}
        sno={p.startNo}
        result={m.result}
        error={error}
        onConfirm={() => run({ type: "CONFIRM", side }, `${label}: ${SIDE_LABEL[side]} xác nhận`, side === "WHITE" && m.black ? "handoff" : "done")}
        onDispute={() => run({ type: "DISPUTE", side }, `${label}: ${SIDE_LABEL[side]} không đồng ý`, "done")}
        onExit={() => confirm("Thoát chế độ xác nhận? Ván vẫn ở trạng thái chờ xác nhận.") && onClose()}
      />
    );
  } else if (step === "handoff") {
    content = (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-amber-400 p-6 text-center text-slate-900">
        <Hand size={64} />
        <div className="text-3xl font-black uppercase">Đưa máy cho Kỳ thủ Đen</div>
        <PieceDot side="BLACK" className="size-10" />
        <div className="text-3xl font-bold">{m.black?.fullName}</div>
        {m.black?.startNo != null && <div className="text-xl font-semibold">STT {m.black.startNo}</div>}
        <BigButton className="w-full max-w-md bg-slate-900 text-white" onClick={() => go("BLACK")}>
          Tôi là kỳ thủ Đen – Tiếp tục
        </BigButton>
        <button onClick={() => (setExceptionFromKiosk(true), go("exception"))} className="mt-4 text-base font-semibold underline">
          Kỳ thủ Đen không có mặt? Yêu cầu TTKT duyệt ngoại lệ
        </button>
      </div>
    );
  } else if (step === "done") {
    const tone = m.status === "OFFICIAL" ? "bg-emerald-600" : m.status === "DISPUTED" ? "bg-red-600" : "bg-amber-500";
    content = (
      <div className={`flex min-h-dvh flex-col items-center justify-center gap-5 p-6 text-center text-white ${tone}`}>
        {m.status === "OFFICIAL" ? <CheckCircle2 size={80} /> : m.status === "DISPUTED" ? <XCircle size={80} /> : <ShieldAlert size={80} />}
        <div className="text-3xl font-black uppercase">
          {m.status === "OFFICIAL"
            ? pendingSync
              ? "Hai kỳ thủ đã xác nhận"
              : "Kết quả đã chính thức"
            : m.status === "DISPUTED"
              ? "Có bất đồng"
              : m.exceptionReason
                ? "Đã gửi yêu cầu duyệt ngoại lệ"
                 : awaitingPublication ? "Chờ TTKT duyệt công bố" : "Chưa hoàn tất xác nhận"}
        </div>
        <div className="text-5xl font-black tabular-nums">{m.result ? RESULT_DISPLAY[m.result].score : ""}</div>
        <p className="max-w-md text-lg">
          {m.status === "DISPUTED"
            ? "Đã chuyển Trọng tài kỹ thuật xử lý. Kết quả chưa được công bố."
            : m.status === "OFFICIAL"
              ? pendingSync
                ? "Kết quả thành chính thức khi máy đồng bộ xong."
                : "Cảm ơn hai kỳ thủ."
              : m.exceptionReason
                ? `Lý do: ${m.exceptionReason}`
                 : awaitingPublication ? "Đã đủ xác nhận kỳ thủ. Kết quả chỉ lên máy chiếu sau khi TTKT duyệt công bố." : "Kiểm tra lại trạng thái ván trong danh sách."}
        </p>
        {pendingSync && offline && (
          <p className="flex items-center gap-2 rounded-sm bg-black/25 px-4 py-3 font-semibold">
            <WifiOff size={20} /> Mất kết nối – thao tác đang giữ trên máy, sẽ tự đồng bộ
          </p>
        )}
        <BigButton className="w-full max-w-md bg-white text-slate-900" onClick={onClose}>
          Trả máy cho trọng tài – Đóng
        </BigButton>
        {m.status === "DISPUTED" && !m.exceptionReason && (
          <button onClick={() => (setExceptionFromKiosk(true), go("exception"))} className="font-semibold underline">
            Yêu cầu TTKT duyệt ngoại lệ
          </button>
        )}
      </div>
    );
  } else {
    content = (
      <ExceptionForm
        error={error}
        onCancel={() => go(exceptionFromKiosk ? (m.status === "AWAITING_CONFIRMATION" && m.whiteConfirmedAt ? "handoff" : "done") : "detail")}
        onSubmit={(reason) => run({ type: "REQUEST_EXCEPTION", reason }, `${label}: yêu cầu duyệt ngoại lệ`, exceptionFromKiosk ? "done" : "detail")}
      />
    );
  }

  const kiosk = KIOSK_STEPS.includes(step) || (step === "exception" && exceptionFromKiosk);
  return kiosk ? <Kiosk>{content}</Kiosk> : <div className="fixed inset-0 z-40 overflow-y-auto bg-[#F5F5F7]">{content}</div>;
}

/** Toàn màn hình, chặn nút Back, khóa cuộn trang dưới: kỳ thủ cầm máy không bấm nhầm sang bàn khác */
function Kiosk({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    history.pushState({ kiosk: true }, "");
    const stay = () => history.pushState({ kiosk: true }, "");
    window.addEventListener("popstate", stay);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("popstate", stay);
      document.body.style.overflow = overflow;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      if (history.state?.kiosk) history.back();
    };
  }, []);
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-white select-none">
      {children}
    </div>
  );
}

function PlayerTurn(props: {
  side: Side;
  name: string;
  sno: number | null;
  result: ResultType | null;
  error: string;
  onConfirm: () => boolean;
  onDispute: () => boolean;
  onExit: () => void;
}) {
  const { side, name, sno, result, error } = props;
  const locked = useRef(false); // khóa ngay sau lần bấm đầu, chống bấm 2 lần
  const [armed, setArmed] = useState(false); // "Không đồng ý" cần chạm 2 lần để tránh bấm nhầm
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(id);
  }, [armed]);
  const once = (f: () => boolean) => {
    if (locked.current) return;
    locked.current = true;
    if (!f()) locked.current = false;
  };
  const dark = side === "BLACK";
  return (
    <div className={`flex min-h-dvh flex-col gap-5 p-5 ${dark ? "bg-slate-900 text-white" : "bg-white text-slate-900"}`}>
      <div className="flex items-center justify-between">
        <span className={`rounded-sm px-3 py-1 text-sm font-bold uppercase ${dark ? "bg-white text-slate-900" : "bg-slate-900 text-white"}`}>
          Lượt {side === "WHITE" ? "1" : "2"}: Kỳ thủ {SIDE_LABEL[side]}
        </span>
        <button onClick={props.onExit} className="px-2 py-1 text-sm opacity-50">
          Thoát
        </button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <div className="text-lg font-semibold uppercase opacity-70">Kỳ thủ cầm quân {SIDE_LABEL[side]}</div>
        <PieceDot side={side} className={`size-10 ${dark ? "border-white" : ""}`} />
        <div className="text-4xl leading-tight font-black">{name}</div>
        {sno != null && <div className="text-2xl font-semibold">STT {sno}</div>}
        <div className={`mt-4 w-full rounded-sm p-5 ${dark ? "bg-white/10" : "bg-slate-100"}`}>
          <div className="text-sm font-semibold uppercase opacity-70">Kết quả ván đấu</div>
          <div className="text-7xl font-black tabular-nums">{result ? RESULT_DISPLAY[result].score : "?"}</div>
          <div className="text-2xl font-bold">{result ? RESULT_DISPLAY[result].text : ""}</div>
        </div>
      </div>
      {error && <Note tone="red">{error}</Note>}
      <div className="flex flex-col gap-3">
        <BigButton className="h-20 bg-emerald-600 text-2xl text-white" onClick={() => once(props.onConfirm)}>
          <CheckCircle2 size={28} /> XÁC NHẬN KẾT QUẢ
        </BigButton>
        <BigButton className={`h-20 text-2xl text-white ${armed ? "bg-red-800 ring-4 ring-red-300" : "bg-red-600"}`} onClick={() => (armed ? once(props.onDispute) : setArmed(true))}>
          <XCircle size={28} /> {armed ? "CHẠM LẦN NỮA ĐỂ XÁC NHẬN" : "KHÔNG ĐỒNG Ý"}
        </BigButton>
      </div>
    </div>
  );
}

function ExceptionForm({ error, onCancel, onSubmit }: { error: string; onCancel: () => void; onSubmit: (reason: string) => boolean }) {
  const [reason, setReason] = useState("");
  return (
    <Sheet title="Yêu cầu duyệt ngoại lệ" onBack={onCancel} backLabel="Quay lại">
      <p className="text-slate-600">Trọng tài kỹ thuật sẽ xem xét và duyệt kết quả. Ván chưa được công bố cho tới khi được duyệt.</p>
      <div className="flex flex-col gap-2">
        {QUICK_REASONS.map((r) => (
          <button key={r} onClick={() => setReason(r)} className={`min-h-12 rounded-sm border px-4 py-2 text-left font-medium ${reason === r ? "border-amber-500 bg-amber-50" : "border-[#E5E5EA] bg-white"}`}>
            {r}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1 font-medium">
        Lý do
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} className="rounded-sm border border-[#E5E5EA] bg-white p-3 text-base" />
      </label>
      {error && <Note tone="red">{error}</Note>}
      <BigButton className="bg-amber-500 text-white disabled:opacity-50" disabled={!reason.trim()} onClick={() => onSubmit(reason)}>
        <ShieldAlert size={22} /> Gửi yêu cầu
      </BigButton>
    </Sheet>
  );
}

function Sheet({ title, onBack, backLabel, children }: { title: string; onBack: () => void; backLabel: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <div className="app-header sticky top-0 z-10 flex items-center gap-2 px-2 py-2">
        <button onClick={onBack} className="flex h-12 items-center gap-1 rounded-sm px-3 font-semibold text-slate-700 active:bg-slate-100">
          <ArrowLeft size={22} /> {backLabel}
        </button>
        <h1 className="flex-1 truncate pr-3 text-right text-lg font-bold">{title}</h1>
      </div>
      <div className="flex flex-col gap-4 p-4">{children}</div>
    </div>
  );
}

function ReviewSide({ side, name, sno }: { side: Side; name: string; sno: number | null }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-500 uppercase">
        <PieceDot side={side} /> Bên {SIDE_LABEL[side]}
      </div>
      <div className="text-3xl leading-tight font-black">{name}</div>
      {sno != null && <div className="text-lg font-semibold text-slate-600">STT {sno}</div>}
    </div>
  );
}

function ResultOption({ r, disabled, onPick, big }: { r: ResultType; disabled: boolean; onPick: () => void; big?: boolean }) {
  return (
    <button
      onClick={onPick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center rounded-sm border border-[#E5E5EA] bg-white px-2 font-bold active:bg-sky-50 disabled:opacity-30 ${big ? "h-24" : "h-20"}`}
    >
      <span className={`tabular-nums ${big ? "text-3xl" : "text-2xl"}`}>{RESULT_DISPLAY[r].score}</span>
      <span className="text-center text-sm leading-tight font-medium text-slate-600">{RESULT_DISPLAY[r].text}</span>
    </button>
  );
}

function BigButton({ className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...p} className={`flex h-16 items-center justify-center gap-2 rounded-sm text-xl font-bold active:scale-[0.98] ${className}`} />;
}

function Note({ tone, children }: { tone: "red" | "green"; children: React.ReactNode }) {
  return <p className={`rounded-sm p-3 font-medium ${tone === "red" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>{children}</p>;
}
