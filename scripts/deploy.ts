import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const privateKey = process.env.OWNER_WALLET_PRIVATE_KEY as `0x${string}`;
if (!privateKey) throw new Error("OWNER_WALLET_PRIVATE_KEY is missing in .env");

const account = privateKeyToAccount(privateKey);

const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(process.env.BASE_SEPOLIA_RPC_URL)
});

const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(process.env.BASE_SEPOLIA_RPC_URL)
});

async function deploy() {
    console.log(`Deploying from account: ${account.address}`);
    
    // Load ABI & Bytecode
    const usdcBuild = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../contracts/build/MockUSDC.json'), 'utf8'));
    const arenaBuild = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../contracts/build/SeraParimutuel.json'), 'utf8'));

    // Deploy MockUSDC
    console.log('Deploying MockUSDC...');
    const usdcHash = await walletClient.deployContract({
        abi: usdcBuild.abi,
        bytecode: `0x${usdcBuild.bytecode}`,
        args: [],
    });
    console.log(`MockUSDC deployment tx: ${usdcHash}`);
    
    const usdcReceipt = await publicClient.waitForTransactionReceipt({ hash: usdcHash });
    const usdcAddress = usdcReceipt.contractAddress;
    console.log(`MockUSDC deployed at: ${usdcAddress}`);

    // Deploy SeraParimutuel (usdc address, oracle address, fee address)
    console.log('Deploying SeraParimutuel...');
    const arenaHash = await walletClient.deployContract({
        abi: arenaBuild.abi,
        bytecode: `0x${arenaBuild.bytecode}`,
        args: [usdcAddress, account.address, account.address], // Oracle and FeeAddress are owner for now
    });
    console.log(`SeraParimutuel deployment tx: ${arenaHash}`);
    
    const arenaReceipt = await publicClient.waitForTransactionReceipt({ hash: arenaHash });
    const arenaAddress = arenaReceipt.contractAddress;
    console.log(`SeraParimutuel deployed at: ${arenaAddress}`);

    // Save deployed addresses to a file
    const output = {
        mockUsdc: usdcAddress,
        seraParimutuel: arenaAddress
    };
    fs.writeFileSync(path.resolve(__dirname, '../contracts/deployed.json'), JSON.stringify(output, null, 2));
    console.log('Deployment complete! Addresses saved to contracts/deployed.json');
}

deploy().catch(console.error);
