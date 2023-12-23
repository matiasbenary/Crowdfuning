// string + bigint
// 64 + 128 => 192 bit => 0.024 kilobyte
// 100 kb => 1 N => 1 * 10^24
// 0,092 kb => 0,024N => 2,4 * 10^22

export const STORAGE_COST: bigint = BigInt("240000000000000000000");