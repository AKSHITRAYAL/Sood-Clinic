const SoodClinicMark = ({ compact = false }) => (
  <span className={`inline-flex items-center gap-2 ${compact ? '' : 'gap-3'}`} aria-label="Sood Clinic">
    <span className="flex h-11 w-14 items-center justify-center rounded-xl border border-[#4d8cc6]/30 bg-white text-2xl font-black tracking-tighter text-[#4d8cc6] shadow-sm">
      A<span className="-ml-1 text-xl font-normal">〈</span>
    </span>
    <span className="flex flex-col leading-none text-[#4d8cc6]">
      <strong className="text-sm tracking-[0.3em]">SOOD</strong>
      {!compact && <small className="mt-1 text-[10px] font-semibold tracking-[0.16em] text-slate-500">CLINIC</small>}
    </span>
  </span>
);

export default SoodClinicMark;
