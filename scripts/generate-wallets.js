const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bip39 = require("bip39");
const { ethers } = require("ethers");
const bitcoin = require("bitcoinjs-lib");
const { BIP32Factory } = require("bip32");
const ecc = require("tiny-secp256k1");
const { Keypair } = require("@solana/web3.js");
const { derivePath: deriveEd25519Path } = require("ed25519-hd-key");
const rippleKeypairs = require("ripple-keypairs");
const { TronWeb } = require("tronweb");
const { bech32 } = require("bech32");
const {
  cryptoWaitReady,
  encodeAddress,
  mnemonicGenerate,
  mnemonicToMiniSecret,
} = require("@polkadot/util-crypto");

const bip32 = BIP32Factory(ecc);
const outputDir = path.join(__dirname, "..", "generated_wallets");

const bitcoinNetworks = {
  bitcoin: bitcoin.networks.bitcoin,
  litecoin: {
    messagePrefix: "\x19Litecoin Signed Message:\n",
    bech32: "ltc",
    bip32: { public: 0x019da462, private: 0x019d9cfe },
    pubKeyHash: 0x30,
    scriptHash: 0x32,
    wif: 0xb0,
  },
  dogecoin: {
    messagePrefix: "\x19Dogecoin Signed Message:\n",
    bech32: "doge",
    bip32: { public: 0x02facafd, private: 0x02fac398 },
    pubKeyHash: 0x1e,
    scriptHash: 0x16,
    wif: 0x9e,
  },
};

function ensureOutputDir() {
  fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });
}

function writeJson(fileName, value) {
  const filePath = path.join(outputDir, fileName);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  fs.chmodSync(filePath, 0o600);
}

function generateMnemonic() {
  return bip39.generateMnemonic(256);
}

function secp256k1Node(mnemonic, derivationPath) {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  return bip32.fromSeed(seed).derivePath(derivationPath);
}

function hash160(buffer) {
  const sha256 = crypto.createHash("sha256").update(buffer).digest();
  return crypto.createHash("ripemd160").update(sha256).digest();
}

function bitcoinLikeWallet(name, label, derivationPath, network, paymentType) {
  const mnemonic = generateMnemonic();
  const node = secp256k1Node(mnemonic, derivationPath);
  const pubkey = Buffer.from(node.publicKey);
  const payment =
    paymentType === "p2wpkh"
      ? bitcoin.payments.p2wpkh({ pubkey, network })
      : bitcoin.payments.p2pkh({ pubkey, network });

  return {
    name,
    label,
    address: payment.address,
    recoveryPhrase: mnemonic,
    derivationPath,
  };
}

function evmWallet() {
  const mnemonic = generateMnemonic();
  const derivationPath = "m/44'/60'/0'/0/0";
  const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, derivationPath);

  return {
    name: "evm",
    label: "Ethereum / EVM",
    address: wallet.address,
    recoveryPhrase: mnemonic,
    derivationPath,
    networks: [
      "Ethereum",
      "BNB Smart Chain",
      "Polygon",
      "Arbitrum",
      "Optimism",
      "Base",
      "Avalanche C-Chain",
      "Fantom",
    ],
  };
}

function solanaWallet() {
  const mnemonic = generateMnemonic();
  const seed = bip39.mnemonicToSeedSync(mnemonic).toString("hex");
  const derivationPath = "m/44'/501'/0'/0'";
  const derived = deriveEd25519Path(derivationPath, seed);
  const keypair = Keypair.fromSeed(derived.key);

  return {
    name: "solana",
    label: "Solana",
    address: keypair.publicKey.toBase58(),
    recoveryPhrase: mnemonic,
    derivationPath,
  };
}

function tronWallet() {
  const mnemonic = generateMnemonic();
  const derivationPath = "m/44'/195'/0'/0/0";
  const node = secp256k1Node(mnemonic, derivationPath);
  const privateKeyHex = Buffer.from(node.privateKey).toString("hex");

  return {
    name: "tron",
    label: "Tron",
    address: TronWeb.address.fromPrivateKey(privateKeyHex),
    recoveryPhrase: mnemonic,
    derivationPath,
  };
}

function xrpWallet() {
  const mnemonic = generateMnemonic();
  const derivationPath = "m/44'/144'/0'/0/0";
  const node = secp256k1Node(mnemonic, derivationPath);
  const publicKey = Buffer.from(node.publicKey).toString("hex").toUpperCase();

  return {
    name: "xrp",
    label: "XRP Ledger",
    address: rippleKeypairs.deriveAddress(publicKey),
    recoveryPhrase: mnemonic,
    derivationPath,
  };
}

function cosmosWallet() {
  const mnemonic = generateMnemonic();
  const derivationPath = "m/44'/118'/0'/0/0";
  const node = secp256k1Node(mnemonic, derivationPath);
  const addressBytes = hash160(Buffer.from(node.publicKey));

  return {
    name: "cosmos",
    label: "Cosmos",
    address: bech32.encode("cosmos", bech32.toWords(addressBytes)),
    recoveryPhrase: mnemonic,
    derivationPath,
  };
}

async function polkadotWallet() {
  await cryptoWaitReady();
  const mnemonic = mnemonicGenerate(24);
  const seed = mnemonicToMiniSecret(mnemonic);

  return {
    name: "polkadot",
    label: "Polkadot",
    address: encodeAddress(seed, 0),
    recoveryPhrase: mnemonic,
    derivationPath: "//0",
  };
}

function publicDonationRecord(wallet) {
  const record = {
    chain: wallet.label,
    address: wallet.address,
  };

  if (wallet.networks) {
    record.networks = wallet.networks;
  }

  return record;
}

function donationMarkdown(donations) {
  const rows = donations.wallets
    .map((wallet) => `| ${wallet.chain} | \`${wallet.address}\` |`)
    .join("\n");
  const evm = donations.wallets.find((wallet) => wallet.chain === "Ethereum / EVM");
  const evmNetworks = formatList(evm?.networks || []);

  return [
    "<!-- donations:start -->",
    "## Donations",
    "",
    "Donation seed phrases are generated locally by running:",
    "",
    "```bash",
    "npm run generate:wallets",
    "```",
    "",
    "The generated recovery phrases are saved in `generated_wallets/`, which is",
    "ignored by git. Only public donation addresses are listed here.",
    "",
    "| Chain | Address |",
    "| --- | --- |",
    rows,
    "",
    evmNetworks
      ? `The Ethereum / EVM address can also receive assets on ${evmNetworks} when using the correct network.`
      : "",
    "<!-- donations:end -->",
    "",
  ].join("\n");
}

function formatList(items) {
  if (items.length < 2) {
    return items.join("");
  }

  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function updateReadme(donations) {
  const readmePath = path.join(__dirname, "..", "README.md");
  const readme = fs.readFileSync(readmePath, "utf8");
  const block = donationMarkdown(donations);
  const sectionPattern = /<!-- donations:start -->[\s\S]*?<!-- donations:end -->\n?/;

  if (sectionPattern.test(readme)) {
    fs.writeFileSync(readmePath, readme.replace(sectionPattern, block));
    return;
  }

  const longTermVisionHeading = "\n## Long-Term Vision\n";
  if (readme.includes(longTermVisionHeading)) {
    fs.writeFileSync(
      readmePath,
      readme.replace(longTermVisionHeading, `\n${block}${longTermVisionHeading.trimStart()}`),
    );
    return;
  }

  fs.writeFileSync(readmePath, `${readme.trimEnd()}\n\n${block}`);
}

async function main() {
  ensureOutputDir();

  const wallets = [
    bitcoinLikeWallet(
      "bitcoin",
      "Bitcoin",
      "m/84'/0'/0'/0/0",
      bitcoinNetworks.bitcoin,
      "p2wpkh",
    ),
    evmWallet(),
    solanaWallet(),
    bitcoinLikeWallet(
      "litecoin",
      "Litecoin",
      "m/84'/2'/0'/0/0",
      bitcoinNetworks.litecoin,
      "p2wpkh",
    ),
    bitcoinLikeWallet(
      "dogecoin",
      "Dogecoin",
      "m/44'/3'/0'/0/0",
      bitcoinNetworks.dogecoin,
      "p2pkh",
    ),
    tronWallet(),
    xrpWallet(),
    cosmosWallet(),
    await polkadotWallet(),
  ];

  const generatedAt = new Date().toISOString();
  const secrets = {
    generatedAt,
    warning:
      "These recovery phrases control funds. Keep this folder private, offline, and out of git.",
    wallets: wallets.map((wallet) => ({
      chain: wallet.label,
      address: wallet.address,
      recoveryPhrase: wallet.recoveryPhrase,
      derivationPath: wallet.derivationPath,
      networks: wallet.networks,
    })),
  };
  const donations = {
    generatedAt,
    wallets: wallets.map(publicDonationRecord),
  };

  writeJson("seed_phrases.json", secrets);
  writeJson("donation_addresses.json", donations);
  updateReadme(donations);

  console.log(`Generated ${wallets.length} wallets.`);
  console.log(`Seed phrases: ${path.join(outputDir, "seed_phrases.json")}`);
  console.log(`Donation addresses: ${path.join(outputDir, "donation_addresses.json")}`);
  console.log(`README updated: ${path.join(__dirname, "..", "README.md")}`);
  console.log("");
  wallets.forEach((wallet) => {
    console.log(`${wallet.label}: ${wallet.address}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
