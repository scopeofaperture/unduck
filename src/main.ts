import "./global.css";
import Dexie from 'dexie';

class UnduckDB extends Dexie {
  config: Dexie.Table<any, string>;

  constructor() {
    super("unduck");
    this.version(1).stores({
      config: ''
    });
    this.config = this.table("config");
  }
}

const db = new UnduckDB();

async function fetchBangsConfig(url: string): Promise<any> {
  console.log(`Fetching bangs config from URL: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch bangs config: ${response.statusText}`);
  }
  const data = await response.json();
  if (!data || !Array.isArray(data)) {
    throw new Error("Invalid bangs config format");
  }
  console.log("Fetched bangs config:", data);
  return { bangs: data };
}

async function getBangsConfig(): Promise<any> {
  console.log("Retrieving bangs config from IndexedDB");
  const config = await db.config.get("bangs");
  if (!config || !Array.isArray(config.bangs)) {
    throw new Error("Invalid bangs config format in IndexedDB");
  }
  console.log("Retrieved bangs config:", config);
  return config;
}

async function saveBangsConfig(config: any): Promise<void> {
  console.log("Saving bangs config to IndexedDB:", config);
  await db.config.put(config, "bangs");
  console.log("Saved bangs config");
}

async function getLastUpdated(): Promise<number> {
  console.log("Retrieving last updated timestamp from IndexedDB");
  const lastUpdated = await db.config.get("lastUpdated");
  console.log("Retrieved last updated timestamp:", lastUpdated);
  return lastUpdated ?? 0;
}

async function saveLastUpdated(timestamp: number): Promise<void> {
  console.log("Saving last updated timestamp to IndexedDB:", timestamp);
  await db.config.put(timestamp, "lastUpdated");
  console.log("Saved last updated timestamp");
}

async function updateBangsConfigIfNeeded(configUrl: string): Promise<any> {
  console.log("Checking if bangs config needs to be updated");
  let config;
  try {
    config = await getBangsConfig();
  } catch (error) {
    console.warn("Failed to retrieve bangs config from IndexedDB:", error);
    config = null;
  }
  let lastUpdated;
  try {
    lastUpdated = await getLastUpdated();
  } catch (error) {
    console.warn("Failed to retrieve last updated timestamp from IndexedDB:", error);
    lastUpdated = 0;
  }
  const now = Date.now();
  if (now - lastUpdated > 10 * 60 * 1000) {
    console.log("Bangs config is outdated, fetching new config");
    const newConfig = await fetchBangsConfig(configUrl);
    await saveBangsConfig(newConfig);
    await saveLastUpdated(now);
    return newConfig;
  }
  console.log("Bangs config is up-to-date");
  return config;
}

function noSearchDefaultPageRender() {
  const app = document.querySelector<HTMLDivElement>("#app")!;
  app.innerHTML = `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh;">
      <div class="content-container">
        <h1>Und*ck</h1>
        <p>DuckDuckGo's bang redirects are too slow. Add the following URL as a custom search engine to your browser. Enables <a href="https://duckduckgo.com/bang.html" target="_blank">all of DuckDuckGo's bangs.</a></p>
        <div class="url-container"> 
          <input 
            type="text" 
            class="url-input"
            value="https://unduck.link?q=%s&config=/config.json"
            readonly 
          />
          <button class="copy-button">
            <img src="/clipboard.svg" alt="Copy" />
          </button>
        </div>
      </div>
      <footer class="footer">
        <a href="https://t3.chat" target="_blank">t3.chat</a>
        •
        <a href="https://x.com/theo" target="_blank">theo</a>
        •
        <a href="https://github.com/t3dotgg/unduck" target="_blank">github</a>
      </footer>
    </div>
  `;

  const copyButton = app.querySelector<HTMLButtonElement>(".copy-button")!;
  const copyIcon = copyButton.querySelector("img")!;
  const urlInput = app.querySelector<HTMLInputElement>(".url-input")!;

  copyButton.addEventListener("click", async () => {
    await navigator.clipboard.writeText(urlInput.value);
    copyIcon.src = "/clipboard-check.svg";

    setTimeout(() => {
      copyIcon.src = "/clipboard.svg";
    }, 2000);
  });
}

const LS_DEFAULT_BANG = localStorage.getItem("default-bang") ?? "g";

async function getBangredirectUrl(configUrl: string) {
  console.log("Getting bang redirect URL");
  let bangsConfig;
  try {
    bangsConfig = await updateBangsConfigIfNeeded(configUrl);
  } catch (error) {
    console.error("Failed to update bangs config:", error);
    return null;
  }
  if (!bangsConfig || !bangsConfig.bangs) {
    console.error("Bangs config is undefined or invalid");
    return null;
  }
  const bangs = bangsConfig.bangs;
  const defaultBang = bangs.find((b: any) => b.t === LS_DEFAULT_BANG);

  const url = new URL(window.location.href);
  const query = url.searchParams.get("q")?.trim() ?? "";
  if (!query) {
    noSearchDefaultPageRender();
    return null;
  }

  const match = query.match(/!(\S+)/i);
  const bangCandidate = match?.[1]?.toLowerCase();
  const selectedBang = bangs.find((b: any) => b.t === bangCandidate) ?? defaultBang;

  const cleanQuery = query.replace(/!\S+\s*/i, "").trim();
  const searchUrl = selectedBang?.u.replace(
    "{{{s}}}",
    encodeURIComponent(cleanQuery).replace(/%2F/g, "/")
  );
  if (!searchUrl) return null;

  console.log("Redirecting to URL:", searchUrl);
  return searchUrl;
}

async function doRedirect() {
  console.log("Starting redirect process");
  const configUrl = new URL(window.location.href).searchParams.get("config");
  if (!configUrl) {
    console.log("No config URL provided, rendering default page");
    noSearchDefaultPageRender();
    return;
  }
  const searchUrl = await getBangredirectUrl(configUrl);
  if (!searchUrl) return;
  window.location.replace(searchUrl);
}

doRedirect();
