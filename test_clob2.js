const { ClobClient } = require('@polymarket/clob-client');
const { createWalletClient, http } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { polygon } = require('viem/chains');

async function test() {
  const host = 'https://clob.polymarket.com';
  const chainId = 137;
  
  const account = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
  const walletClient = createWalletClient({
    account,
    chain: polygon,
    transport: http('https://polygon-rpc.com')
  });

  const client = new ClobClient(host, chainId, walletClient);
  
  const tokenId = "34626184950254225208692030156208941308358060420950772251072421141618169142241";
  console.log("Getting orderbook for", tokenId);
  try {
    const ob = await client.getOrderBook(tokenId);
    console.log("Success:", JSON.stringify(ob).slice(0, 200));
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
