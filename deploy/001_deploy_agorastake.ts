import { readFileSync } from "fs";
import path from "path";
import {
  TransactionHash,
  TransactionStatus,
  GenLayerClient,
  DecodedDeployData,
  GenLayerChain,
} from "genlayer-js/types";
import { testnetBradbury } from "genlayer-js/chains";

// Protocol defaults for a fresh deployment. Adjust before running against a
// network you intend to keep -- the admin can still change these later via
// set_protocol_fee_bps / set_min_stake, this just sets the starting point.
//
// The live instance at 0x35BfFc75e4661Cb05bc91468616E2A301547722B was
// deployed with protocol_fee_bps=250 (2.5%) and min_stake=5 GEN -- the
// values below match it so re-running this script reproduces the same
// configuration on a fresh deployment.
const PROTOCOL_FEE_BPS = 250; // 2.5%
const MIN_STAKE = BigInt(5) * BigInt(10 ** 18); // 5 GEN

export default async function main(client: GenLayerClient<any>) {
  const filePath = path.resolve(process.cwd(), "contracts/agora_stake.py");
  const contractCode = new Uint8Array(readFileSync(filePath));

  await client.initializeConsensusSmartContract();

  const deployTransaction = await client.deployContract({
    code: contractCode,
    args: [PROTOCOL_FEE_BPS, MIN_STAKE],
  });

  const receipt = await client.waitForTransactionReceipt({
    hash: deployTransaction as TransactionHash,
    retries: 200,
  });

  if (
    receipt.statusName !== TransactionStatus.ACCEPTED &&
    receipt.statusName !== TransactionStatus.FINALIZED
  ) {
    throw new Error(`Deployment failed. Receipt: ${JSON.stringify(receipt)}`);
  }

  const deployedContractAddress =
    (client.chain as GenLayerChain).id !== testnetBradbury.id
      ? receipt.data.contract_address
      : (receipt.txDataDecoded as DecodedDeployData)?.contractAddress;

  console.log("AgoraStake deployed:", {
    "Transaction Hash": deployTransaction,
    "Contract Address": deployedContractAddress,
    "Protocol fee (bps)": PROTOCOL_FEE_BPS,
    "Minimum stake (wei)": MIN_STAKE.toString(),
  });

  return deployedContractAddress;
}
