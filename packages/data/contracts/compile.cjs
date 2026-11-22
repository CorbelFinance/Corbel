const solc=require('solc');const fs=require('fs');
const src=fs.readFileSync(process.argv[2],'utf8');
const input={language:'Solidity',sources:{'TrustSim.sol':{content:src}},settings:{optimizer:{enabled:true,runs:200},viaIR:true,evmVersion:'paris',outputSelection:{'*':{'*':['evm.deployedBytecode.object','abi']}}}};
const out=JSON.parse(solc.compile(JSON.stringify(input)));
for(const e of out.errors||[]) console.error(e.severity, e.formattedMessage.split('\n').slice(0,3).join(' | '));
const c=out.contracts?.['TrustSim.sol']?.TrustSim; if(!c) process.exit(1);
fs.writeFileSync(process.argv[3], `/** Generated from contracts/TrustSim.sol with solc ${solc.version()} (optimizer 200, viaIR, evm paris). Do not edit. */\nexport const TRUST_SIM_RUNTIME = "0x${c.evm.deployedBytecode.object}" as const;\nexport const TRUST_SIM_ABI = ${JSON.stringify(c.abi)} as const;\n`);
console.log('runtime bytes', c.evm.deployedBytecode.object.length/2);
