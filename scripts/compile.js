const path = require('path');
const fs = require('fs');
const solc = require('solc');

function compileContract(fileName, contractName) {
    const contractPath = path.resolve(__dirname, '..', 'contracts', fileName);
    const source = fs.readFileSync(contractPath, 'utf8');

    const input = {
        language: 'Solidity',
        sources: {
            [fileName]: {
                content: source,
            },
        },
        settings: {
            outputSelection: {
                '*': {
                    '*': ['*'],
                },
            },
        },
    };

    console.log(`Compiling ${fileName}...`);
    const output = JSON.parse(solc.compile(JSON.stringify(input)));

    if (output.errors) {
        let hasError = false;
        output.errors.forEach((err) => {
            console.error(err.formattedMessage);
            if (err.severity === 'error') hasError = true;
        });
        if (hasError) throw new Error(`Failed to compile ${fileName}`);
    }

    const contract = output.contracts[fileName][contractName];
    
    // Save ABI and Bytecode
    const outDir = path.resolve(__dirname, '..', 'contracts', 'build');
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir);
    }
    
    fs.writeFileSync(
        path.resolve(outDir, `${contractName}.json`),
        JSON.stringify({
            abi: contract.abi,
            bytecode: contract.evm.bytecode.object
        }, null, 2)
    );
    console.log(`Successfully compiled ${contractName}`);
}

try {
    compileContract('MockUSDC.sol', 'MockUSDC');
    compileContract('SeraParimutuel.sol', 'SeraParimutuel');
} catch (e) {
    console.error(e);
    process.exit(1);
}
