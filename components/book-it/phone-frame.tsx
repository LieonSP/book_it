/**
 * components/book-it/phone-frame.tsx
 *
 * Wraps the whole app in an iPhone-style bezel on laptop/desktop screens,
 * so training sessions show a realistic mobile view without opening
 * DevTools and switching to device mode.
 *
 * On any viewport narrower than the `lg` breakpoint (1024px) — i.e. every
 * real phone or tablet — every class here is inert: no frame, no wrapper
 * styling, `children` renders exactly as it always has.
 */
export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="lg:flex lg:min-h-screen lg:items-center lg:justify-center lg:bg-neutral-200 lg:p-10">
      <div className="lg:relative lg:h-[844px] lg:w-[390px] lg:shrink-0 lg:rounded-[55px] lg:bg-neutral-900 lg:p-[14px] lg:shadow-2xl">
        {/* Dynamic island — decorative, hidden below lg */}
        <div
          aria-hidden
          className="hidden lg:absolute lg:left-1/2 lg:top-[14px] lg:z-20 lg:block lg:h-[26px] lg:w-[100px] lg:-translate-x-1/2 lg:rounded-full lg:bg-neutral-900"
        />
        {/* Screen */}
        <div className="phone-frame-viewport lg:h-full lg:w-full lg:overflow-x-hidden lg:overflow-y-auto lg:rounded-[42px] lg:bg-white">
          {children}
        </div>
        {/* Home indicator — decorative, hidden below lg */}
        <div
          aria-hidden
          className="hidden lg:absolute lg:bottom-[10px] lg:left-1/2 lg:z-20 lg:block lg:h-[5px] lg:w-[120px] lg:-translate-x-1/2 lg:rounded-full lg:bg-neutral-900/70"
        />
      </div>
    </div>
  );
}
