// The race card's body, the same height whether it holds the plot (the phone's 88px readout strip,
// the plot and the day labels, with their gaps) or the empty state, so the leaderboard's skeletons
// draw one card for both and nothing jumps. Its own module, so the lazy wrapper and the page's
// skeleton take it without pulling the chart's code into their chunk.
export const RACE_BODY_HEIGHT = 'min-h-[340px] md:min-h-[284px]'
export const RACE_SKELETON_BODY = 'h-[340px] md:h-[284px]'
