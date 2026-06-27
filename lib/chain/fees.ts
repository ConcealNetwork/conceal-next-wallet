/** Send-fee display helpers — derived from SDK chain constants. */
import { COIN_UNIT_PLACES, MINIMUM_FEE_V2, REMOTE_NODE_FEE_ATOMIC } from "conceal-wallet-sdk";

const ATOMIC_PER_CCX = 10 ** COIN_UNIT_PLACES;

export const NETWORK_FEE_CCX = MINIMUM_FEE_V2 / ATOMIC_PER_CCX;
export const REMOTE_NODE_FEE_CCX = REMOTE_NODE_FEE_ATOMIC / ATOMIC_PER_CCX;
export const SEND_FEE_CCX = NETWORK_FEE_CCX + REMOTE_NODE_FEE_CCX;
