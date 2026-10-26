// One line above Place when the slip came back refused (MKT-3): each refusal shows on its own pick
// or on the parlay, which may have scrolled out of view, so this says how many and where to look.
// place_slip_v4 refuses one thing at a time, so a price that moved is the only refusal there is.
export function slipErrorSummary({ picks, parlay, priceMoved }: { picks: number; parlay: boolean; priceMoved: boolean }): string | null {
  if (picks === 0 && !parlay) return null
  const many = picks + (parlay ? 1 : 0) > 1
  const look = many ? 'Check them above' : 'Check it above'
  if (priceMoved) {
    const whose =
      picks === 0
        ? 'The parlay’s price'
        : picks === 1
          ? `1 pick’s${parlay ? ' and the parlay’s' : ''} price${parlay ? 's' : ''}`
          : `${picks} picks’${parlay ? ' and the parlay’s' : ''} prices`
    return `${whose} moved. ${look}, then tap Place again.`
  }
  const what = picks === 0 ? 'The parlay' : `${picks} ${picks === 1 ? 'pick' : 'picks'}${parlay ? ' and the parlay' : ''}`
  return `${what} ${many ? 'need' : 'needs'} a change. ${look}.`
}
