import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import solc from 'solc';
import { createWalletClient, createPublicClient, http, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

async function main() {
  console.log(`[Deployer] Starting deployment of SeraRegistry to Base Mainnet...`);

  // 1. Check Owner Key
  const ownerKey = process.env.OWNER_WALLET_PRIVATE_KEY;
  if (!ownerKey) {
    throw new Error('OWNER_WALLET_PRIVATE_KEY is missing in .env');
  }

  const account = privateKeyToAccount(ownerKey as `0x${string}`);
  
  const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
  });

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
  });

  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`[Deployer] Deployer Address: ${account.address}`);
  console.log(`[Deployer] Deployer Balance: ${formatEther(balance)} ETH`);

  if (balance === 0n) {
    throw new Error('Deployer wallet has 0 ETH. Please fund it first.');
  }

  // 2. Compile Contract
  console.log(`[Deployer] Compiling SeraRegistry.sol...`);
  const contractPath = path.resolve(__dirname, '../contracts/SeraRegistry.sol');
  const sourceCode = fs.readFileSync(contractPath, 'utf8');

  const input = {
    language: 'Solidity',
    sources: {
      'SeraRegistry.sol': {
        content: sourceCode,
      },
    },
    settings: {
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object'],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  
  if (output.errors) {
    const isFatal = output.errors.some((err: any) => err.severity === 'error');
    if (isFatal) {
      console.error(output.errors);
      throw new Error('Compilation failed.');
    }
  }

  const contract = output.contracts['SeraRegistry.sol']['SeraRegistry'];
  const abi = contract.abi;
  const bytecode = contract.evm.bytecode.object;

  console.log(`[Deployer] Compilation successful.`);
  console.log(`[Deployer] Deploying contract to Base Mainnet...`);

  // 3. Deploy
  const deployHash = await walletClient.deployContract({
    abi,
    bytecode: `0x${bytecode}`,
  });

  console.log(`[Deployer] Transaction sent! Hash: ${deployHash}`);
  console.log(`[Deployer] Waiting for confirmation...`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });

  if (receipt.status === 'success') {
    console.log(`\n🎉 SUCCESS! Contract deployed at: ${receipt.contractAddress}`);
    console.log(`\nPlease add the following line to your .env file:`);
    console.log(`SERA_REGISTRY_ADDRESS="${receipt.contractAddress}"\n`);
  } else {
    console.error(`[Deployer] Deployment failed!`);
  }
}

main().catch(console.error);
