/* AgentBoard frontend — pure vanilla JS, no libraries, no CDN.
   Talks to the injected wallet (window.ethereum) and to one public chain RPC.
   It makes no request to any other server. */
"use strict";

/* ---- Config: fill in boardAddress + deployBlock after deployment. ---- */
const CONFIG = {
  chainId: 56, // BNB Smart Chain mainnet (97 for BSC testnet)
  chainIdHex: "0x38",
  rpcUrl: "https://bsc-dataseed.binance.org/",
  registryAddress: "0x60b9262456de011f7d15a54cdd8c48baaa8b022f", // SPACE ID Agent ID (ERC-721)
  boardAddress: "0xE3C64D4b0325e9cD3a4a4443cc63366C4e1E4402", // AgentBoard contract (BSC mainnet, deployed 2026-11-19)
  deployBlock: 134538764, // first block of the board contract
  bscScan: "https://bscscan.com/address/",
};

/* Function selectors (AgentBoard + Agent ID registry). */
const SEL = {
  checkIn: "0xf21bb4c5",
  balanceOf: "0x70a08231",
  streakOf: "0x4fc1854a",
  totalCheckIns: "0x828e1ffd",
  hasCheckedInToday: "0x3504f52b",
  totalCheckInsGlobal: "0x0cdbd5f5",
  totalAgents: "0xc5053712",
  paused: "0x5c975abb",
};
const CHECKED_IN_TOPIC = "0x76cf0d7fc400e4e714c66e756e4d48ac887544a18d57fd13965186509311698b";

const $ = (id) => document.getElementById(id);
const enc = new TextEncoder();
const dec = new TextDecoder();

let account = null;

/* ---------- tiny ABI helpers (no library) ---------- */
function hexPad32(hex) {
  hex = hex.replace(/^0x/, "");
  return "0x" + hex.padStart(64, "0");
}
function encodeAddress(addr) {
  return hexPad32(addr).slice(2);
}
function encodeUint256(n) {
  return BigInt(n).toString(16).padStart(64, "0");
}
function decodeUint256(hex) {
  return BigInt("0x" + hex.replace(/^0x/, ""));
}
function encodeCheckInCalldata(message) {
  const bytes = enc.encode(message);
  const len = bytes.length;
  const paddedLen = Math.ceil(len / 32) * 32;
  const data = new Uint8Array(paddedLen);
  data.set(bytes);
  let dataHex = "";
  for (const b of data) dataHex += b.toString(16).padStart(2, "0");
  // checkIn(string): selector + offset(0x20) + length + data
  return SEL.checkIn + encodeUint256(32) + encodeUint256(len) + dataHex;
}
function decodeCheckedInData(dataHex) {
  // data = streak (32B) + string offset (32B) + string length (32B) + string bytes
  const raw = dataHex.replace(/^0x/, "");
  const streak = decodeUint256("0x" + raw.slice(0, 64));
  const strLen = Number(decodeUint256("0x" + raw.slice(128, 192)));
  const strBytes = new Uint8Array(strLen);
  for (let i = 0; i < strLen; i++) {
    strBytes[i] = parseInt(raw.slice(192 + i * 2, 194 + i * 2), 16);
  }
  return { streak, message: dec.decode(strBytes) };
}

/* ---------- chain RPC (public, no key) ---------- */
async function rpc(method, params) {
  const res = await fetch(CONFIG.rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || "RPC error");
  return j.result;
}
async function ethCall(to, data) {
  return rpc("eth_call", [{ to, data }, "latest"]);
}

/* ---------- wallet ---------- */
function hasWallet() {
  return typeof window.ethereum !== "undefined";
}
async function connectWallet() {
  if (!hasWallet()) {
    $("walletLine").textContent = "No wallet found. Install MetaMask or Binance Wallet, then reload.";
    return;
  }
  try {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    account = accounts[0];
    $("walletLine").textContent = "Connected: " + account;
    $("connectBtn").textContent = "Connected";
    await ensureChain();
    await refreshStatus();
  } catch (e) {
    $("walletLine").textContent = "Connection rejected: " + (e.message || e);
  }
}
async function ensureChain() {
  const chainIdHex = await window.ethereum.request({ method: "eth_chainId" });
  if (parseInt(chainIdHex, 16) !== CONFIG.chainId) {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CONFIG.chainIdHex }],
      });
    } catch (e) {
      $("walletLine").textContent += " — please switch your wallet to BNB Smart Chain (chain " + CONFIG.chainId + ").";
    }
  }
}

/* ---------- reads ---------- */
async function refreshStatus() {
  if (!account) return;
  // Agent ID balance.
  let agentIdBalance = 0n;
  try {
    const bal = await ethCall(CONFIG.registryAddress, SEL.balanceOf + encodeAddress(account));
    agentIdBalance = decodeUint256(bal);
  } catch (e) {
    $("agentIdLine").textContent = "Could not read your Agent ID balance (" + (e.message || e) + ").";
  }
  const holds = agentIdBalance > 0n;
  if (holds) {
    $("agentIdLine").textContent = "✓ This wallet holds an Agent ID. You can check in.";
  } else {
    $("agentIdLine").textContent = "This wallet holds no Agent ID. Claim one in the Binance App (Wallet > Agent ID) to check in.";
  }
  $("checkinBtn").disabled = !holds || !CONFIG.boardAddress;

  if (!CONFIG.boardAddress) {
    $("globalTotalVal").textContent = "contract not deployed yet";
    return;
  }
  try {
    const [streak, total, today, globalTotal, agents, paused] = await Promise.all([
      ethCall(CONFIG.boardAddress, SEL.streakOf + encodeAddress(account)).then(decodeUint256),
      ethCall(CONFIG.boardAddress, SEL.totalCheckIns + encodeAddress(account)).then(decodeUint256),
      ethCall(CONFIG.boardAddress, SEL.hasCheckedInToday + encodeAddress(account)).then((h) => decodeUint256(h) !== 0n),
      ethCall(CONFIG.boardAddress, SEL.totalCheckInsGlobal).then(decodeUint256),
      ethCall(CONFIG.boardAddress, SEL.totalAgents).then(decodeUint256),
      ethCall(CONFIG.boardAddress, SEL.paused).then((h) => decodeUint256(h) !== 0n),
    ]);
    $("streakVal").textContent = String(streak);
    $("myTotalVal").textContent = String(total);
    $("todayVal").textContent = today ? "✓ already checked in" : "not yet";
    $("globalTotalVal").textContent = String(globalTotal);
    $("agentsVal").textContent = String(agents);
    if (paused) {
      $("agentIdLine").textContent += " The board is currently paused.";
      $("checkinBtn").disabled = true;
    }
    if (today) $("checkinBtn").disabled = true;
  } catch (e) {
    $("agentIdLine").textContent += " (Could not read board stats: " + (e.message || e) + ")";
  }
}

/* ---------- check-in ---------- */
async function doCheckIn() {
  if (!account || !CONFIG.boardAddress) return;
  const message = $("msgInput").value;
  if (enc.encode(message).length > 280) {
    $("txLine").textContent = "Message is over 280 bytes.";
    return;
  }
  $("checkinBtn").disabled = true;
  $("txLine").textContent = "Confirm the transaction in your wallet…";
  try {
    const data = encodeCheckInCalldata(message);
    const txHash = await window.ethereum.request({
      method: "eth_sendTransaction",
      params: [{ from: account, to: CONFIG.boardAddress, data }],
    });
    $("txLine").textContent = "Sent! Transaction: " + txHash;
    $("msgInput").value = "";
    $("charCount").textContent = "0";
    // Refresh after a short wait so the chain can include it.
    setTimeout(() => { refreshStatus(); loadBoard(); }, 8000);
  } catch (e) {
    $("txLine").textContent = "Transaction failed or rejected: " + (e.message || e);
    $("checkinBtn").disabled = false;
  }
}

/* ---------- public board (eth_getLogs) ---------- */
async function loadBoard() {
  const list = $("boardList");
  if (!CONFIG.boardAddress) {
    list.innerHTML = '<li class="muted">The board contract is not deployed yet.</li>';
    return;
  }
  list.innerHTML = '<li class="muted">Loading…</li>';
  try {
    const latestHex = await rpc("eth_blockNumber", []);
    const latest = Number(decodeUint256(latestHex));
    const fromBlock = CONFIG.deployBlock > 0 ? CONFIG.deployBlock : Math.max(0, latest - 20000);
    const logs = await rpc("eth_getLogs", [{
      fromBlock: "0x" + fromBlock.toString(16),
      toBlock: "latest",
      address: CONFIG.boardAddress,
      topics: [CHECKED_IN_TOPIC],
    }]);
    if (!logs || logs.length === 0) {
      list.innerHTML = '<li class="muted">No check-ins yet. Be the first.</li>';
      return;
    }
    const items = logs.slice().reverse().slice(0, 50).map((log) => {
      const agent = "0x" + log.topics[1].slice(-40);
      const day = Number(decodeUint256(log.topics[2]));
      const { streak, message } = decodeCheckedInData(log.data);
      const date = new Date(day * 86400 * 1000).toISOString().slice(0, 10);
      const li = document.createElement("li");
      const addr = document.createElement("code");
      addr.textContent = agent;
      const meta = document.createElement("span");
      meta.className = "muted";
      meta.textContent = " · " + date + " · streak " + String(streak);
      const msg = document.createElement("div");
      msg.textContent = message;
      li.append(addr, meta, msg);
      return li;
    });
    list.innerHTML = "";
    for (const li of items) list.appendChild(li);
  } catch (e) {
    list.innerHTML = '<li class="muted">Could not load the board: ' + (e.message || e) + "</li>";
  }
}

/* ---------- wiring ---------- */
$("connectBtn").addEventListener("click", connectWallet);
$("checkinBtn").addEventListener("click", doCheckIn);
$("refreshBoardBtn").addEventListener("click", loadBoard);
$("msgInput").addEventListener("input", () => {
  $("charCount").textContent = String($("msgInput").value.length);
});
if (hasWallet()) {
  window.ethereum.on("accountsChanged", (accs) => {
    account = accs[0] || null;
    $("walletLine").textContent = account ? "Connected: " + account : "Not connected.";
    refreshStatus();
  });
  window.ethereum.on("chainChanged", () => window.location.reload());
}
if (CONFIG.boardAddress) {
  $("contractAddr").textContent = CONFIG.boardAddress;
  const a = document.createElement("a");
  a.href = CONFIG.bscScan + CONFIG.boardAddress;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = "(view on BscScan)";
  $("bscscanLink").appendChild(a);
}
loadBoard();
