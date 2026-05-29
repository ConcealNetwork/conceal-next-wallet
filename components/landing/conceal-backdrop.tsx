const COIN_MASK =
  "radial-gradient(circle at 50% 49%, #000 42%, rgba(0,0,0,.45) 58%, transparent 70%)"

/** Fixed, full-bleed atmosphere for the landing hero: a warm ambient light in
 *  the top-right and the faceted Conceal coin sitting low/right, bleeding off
 *  the page edges. Purely decorative — clipped by overflow-hidden so it never
 *  introduces horizontal scroll. */
export function ConcealBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div
        className="absolute -top-[16%] -right-[10%] h-[860px] w-[860px] blur-[10px]"
        style={{
          background:
            "radial-gradient(circle at center, hsl(39 100% 50% / 0.18), hsl(33 100% 50% / 0.06) 40%, transparent 66%)",
        }}
      />
      <div
        className="absolute top-1/2 right-[-12%] aspect-square h-[118vh] w-auto -translate-y-1/2 mix-blend-screen opacity-[0.34]"
        style={{
          backgroundImage: "url('/brand/conceal-coin.png')",
          backgroundSize: "contain",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          WebkitMaskImage: COIN_MASK,
          maskImage: COIN_MASK,
        }}
      />
    </div>
  )
}
