import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
// @ts-ignore
import solc from 'solc';
import { createWalletClient, createPublicClient, http, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

async function main() {
  console.log(`[Deployer] Starting deployment of SeraVault to Base Mainnet...`);

  const ownerKey = process.env.OWNER_WALLET_PRIVATE_KEY;
  if (!ownerKey) throw new Error('OWNER_WALLET_PRIVATE_KEY is missing in .env');

  const account = privateKeyToAccount(ownerKey as `0x${string}`);
  const publicClient = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org') });
  const walletClient = createWalletClient({ account, chain: base, transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org') });

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`[Deployer] Deployer Address: ${account.address}`);
  console.log(`[Deployer] Deployer Balance: ${formatEther(balance)} ETH`);

  if (balance === 0n) throw new Error('Deployer wallet has 0 ETH.');

  console.log(`[Deployer] Compiling SeraVault.sol...`);
  const contractPath = path.resolve(__dirname, '../contracts/SeraVault.sol');
  const sourceCode = fs.readFileSync(contractPath, 'utf8');

  const input = {
    language: 'Solidity',
    sources: { 'SeraVault.sol': { content: sourceCode } },
    settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  
  if (output.errors) {
    const isFatal = output.errors.some((err: any) => err.severity === 'error');
    if (isFatal) {
      console.error(output.errors);
      throw new Error('Compilation failed.');
    }
  }

  const contract = output.contracts['SeraVault.sol']['SeraVault'];
  const abi = contract.abi;
  const bytecode = contract.evm.bytecode.object;

  console.log(`[Deployer] Compilation successful.`);
  console.log(`[Deployer] Deploying contract...`);

  const deployHash = await walletClient.deployContract({ abi, bytecode: `0x${bytecode}` });
  console.log(`[Deployer] TX Sent! Hash: ${deployHash}`);
  
  const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
  if (receipt.status === 'success') {
    console.log(`\n🎉 SUCCESS! SeraVault deployed at: ${receipt.contractAddress}`);
    console.log(`Please update your .env with:\nSERA_VAULT_ADDRESS="${receipt.contractAddress}"\n`);
  }
}

main().catch(console.error);
