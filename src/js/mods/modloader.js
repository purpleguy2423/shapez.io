/* typehints:start */
import { Application } from "../application";
/* typehints:end */
import { globalConfig } from "../core/config";
import { createLogger } from "../core/logging";
import { StorageImplBrowserIndexedDB } from "../platform/browser/storage_indexed_db";
import { StorageImplElectron } from "../platform/electron/storage";
import { FILE_NOT_FOUND } from "../platform/storage";
import { Mod } from "./mod";
import { ModInterface } from "./mod_interface";
import { MOD_SIGNALS } from "./mod_signals";

import semverValidRange from "semver/ranges/valid";
import semverSatisifies from "semver/functions/satisfies";

const LOG = createLogger("mods");

/**
 * @typedef {{
 *   name: string;
 *   version: string;
 *   author: string;
 *   website: string;
 *   description: string;
 *   id: string;
 *   minimumGameVersion?: string;
 *   settings: [];
 *   doesNotAffectSavegame?: boolean
 * }} ModMetadata
 */

export class ModLoader {
    constructor() {
        LOG.log("modloader created");

        /**
         * @type {Application}
         */
        this.app = undefined;
        this.storage = null;

        /** @type {Mod[]} */
        this.mods = [];

        /** @type {{ meta: ModMetadata, modClass: typeof Mod, enabled: boolean }[]} */
        this.modEntries = [];

        this.modInterface = new ModInterface(this);

        /** @type {({ meta: ModMetadata, modClass: typeof Mod})[]} */
        this.modLoadQueue = [];

        this.initialized = false;

        this.signals = MOD_SIGNALS;
    }

    linkApp(app) {
        this.app = app;
    }

    anyModsActive() {
        return this.mods.length > 0;
    }

    getModEntries() {
        return this.modEntries;
    }

    getModEnabledStateMap() {
        const stateMap = {};
        this.modEntries.forEach(entry => {
            stateMap[entry.meta.id] = !!entry.enabled;
        });
        return stateMap;
    }

    async persistModEnabledState() {
        if (!this.storage) {
            return;
        }
        await this.storage.writeFileAsync("mods_enabled.json", JSON.stringify(this.getModEnabledStateMap()));
    }

    async loadModEnabledState() {
        if (!this.storage) {
            return {};
        }

        try {
            const data = await this.storage.readFileAsync("mods_enabled.json");
            return JSON.parse(data);
        } catch (ex) {
            if (ex !== FILE_NOT_FOUND) {
                console.warn("Failed to load mod enabled state", ex);
            }
            return {};
        }
    }

    async createModInstance(entry) {
        const modDataFile = "modsettings_" + entry.meta.id + "__" + entry.meta.version + ".json";

        let settings = entry.meta.settings;

        if (entry.meta.settings) {
            try {
                const storedSettings = await this.storage.readFileAsync(modDataFile);
                settings = JSON.parse(storedSettings);
            } catch (ex) {
                if (ex === FILE_NOT_FOUND) {
                    await this.storage.writeFileAsync(modDataFile, JSON.stringify(entry.meta.settings));
                } else {
                    alert("Failed to load settings for " + entry.meta.id + ", will use defaults:\n\n" + ex);
                }
            }
        }

        const mod = new entry.modClass({
            app: this.app,
            modLoader: this,
            meta: entry.meta,
            settings,
            saveSettings: () => this.storage.writeFileAsync(modDataFile, JSON.stringify(mod.settings)),
        });
        await mod.init();
        return mod;
    }

    async toggleModEnabled(id, enabled) {
        const entry = this.modEntries.find(modEntry => modEntry.meta.id === id);
        if (!entry) {
            return;
        }

        const previousEnabled = entry.enabled;
        entry.enabled = enabled;
        try {
            await this.persistModEnabledState();
        } catch (ex) {
            entry.enabled = previousEnabled;
            throw ex;
        }
    }

    /**
     *
     * @returns {import("../savegame/savegame_typedefs").SavegameStoredMods}
     */
    getModsListForSavegame() {
        return this.mods
            .filter(mod => !mod.metadata.doesNotAffectSavegame)
            .map(mod => ({
                id: mod.metadata.id,
                version: mod.metadata.version,
                website: mod.metadata.website,
                name: mod.metadata.name,
                author: mod.metadata.author,
            }));
    }

    /**
     *
     * @param {import("../savegame/savegame_typedefs").SavegameStoredMods} originalMods
     */
    computeModDifference(originalMods) {
        /**
         * @type {import("../savegame/savegame_typedefs").SavegameStoredMods}
         */
        let missing = [];

        const current = this.getModsListForSavegame();

        originalMods.forEach(mod => {
            for (let i = 0; i < current.length; ++i) {
                const currentMod = current[i];
                if (currentMod.id === mod.id && currentMod.version === mod.version) {
                    current.splice(i, 1);
                    return;
                }
            }
            missing.push(mod);
        });

        return {
            missing,
            extra: current,
        };
    }

    exposeExports() {
        if (G_IS_STEAM_DEMO) {
            return;
        }

        if (G_IS_DEV || G_IS_STANDALONE) {
            let exports = {};
            const modules = require.context("../", true, /\.js$/);
            Array.from(modules.keys()).forEach(key => {
                // @ts-ignore
                const module = modules(key);
                for (const member in module) {
                    if (member === "default" || member === "__$S__") {
                        // Setter
                        continue;
                    }
                    if (exports[member]) {
                        throw new Error("Duplicate export of " + member);
                    }

                    Object.defineProperty(exports, member, {
                        get() {
                            return module[member];
                        },
                        set(v) {
                            module.__$S__(member, v);
                        },
                    });
                }
            });

            window.shapez = exports;
        }
    }

    async initMods() {
        if (G_IS_STEAM_DEMO) {
            this.initialized = true;
            return;
        }

        if (!G_IS_STANDALONE && !G_IS_DEV) {
            this.initialized = true;
            return;
        }

        // Create a storage for reading mod settings
        const storage = G_IS_STANDALONE
            ? new StorageImplElectron(this.app)
            : new StorageImplBrowserIndexedDB(this.app);
        await storage.initialize();
        this.storage = storage;

        LOG.log("hook:init", this.app, this.app.storage);
        this.exposeExports();

        let mods = [];
        if (G_IS_STANDALONE) {
            mods = await ipcRenderer.invoke("get-mods");
        }
        if (G_IS_DEV && globalConfig.debug.externalModUrl) {
            const modURLs = Array.isArray(globalConfig.debug.externalModUrl)
                ? globalConfig.debug.externalModUrl
                : [globalConfig.debug.externalModUrl];

            for (let i = 0; i < modURLs.length; i++) {
                const modURL = modURLs[i];
                const resolvedURL = (() => {
                    if (typeof window === "undefined") {
                        return modURL;
                    }

                    try {
                        const parsedURL = new URL(modURL);
                        const localHostnames = ["localhost", "127.0.0.1", "0.0.0.0"];
                        if (localHostnames.includes(parsedURL.hostname.toLowerCase())) {
                            const codespaceHost = window.location.hostname.match(
                                /^(.*)-\d+(\.app)?\.github\.dev$/i
                            );
                            const targetPort = parsedURL.port || "3010";
                            if (codespaceHost) {
                                return new URL(
                                    parsedURL.pathname + parsedURL.search,
                                    `${window.location.protocol}//${codespaceHost[1]}-${targetPort}${
                                        codespaceHost[2] || ""
                                    }.github.dev`
                                ).toString();
                            }

                            return new URL(
                                parsedURL.pathname + parsedURL.search,
                                `${window.location.protocol}//${window.location.hostname}:${targetPort}`
                            ).toString();
                        }
                    } catch (ex) {
                        console.warn("Could not resolve external mod URL", modURL, ex);
                    }
                    return modURL;
                })();

                const response = await fetch(resolvedURL, {
                    method: "GET",
                });
                if (response.status !== 200) {
                    throw new Error(
                        "Failed to load " + resolvedURL + ": " + response.status + " " + response.statusText
                    );
                }
                mods.push(await response.text());
            }
        }

        const modStateMap = await this.loadModEnabledState();

        window.$shapez_registerMod = (modClass, meta) => {
            if (this.initialized) {
                throw new Error("Can't register mod after modloader is initialized");
            }
            if (this.modLoadQueue.some(entry => entry.meta.id === meta.id)) {
                console.warn("Not registering mod", meta, "since a mod with the same id is already loaded");
                return;
            }
            this.modLoadQueue.push({
                modClass,
                meta,
            });
        };

        mods.forEach(modCode => {
            modCode += `
                        if (typeof Mod !== 'undefined') {
                            if (typeof METADATA !== 'object') {
                                throw new Error("No METADATA variable found");
                            }
                            window.$shapez_registerMod(Mod, METADATA);
                        }
                    `;
            try {
                const func = new Function(modCode);
                func();
            } catch (ex) {
                console.error(ex);
                alert("Failed to parse mod (launch with --dev for more info): \n\n" + ex);
            }
        });

        delete window.$shapez_registerMod;

        for (let i = 0; i < this.modLoadQueue.length; i++) {
            const { modClass, meta } = this.modLoadQueue[i];

            if (meta.minimumGameVersion) {
                const minimumGameVersion = meta.minimumGameVersion;
                if (!semverValidRange(minimumGameVersion)) {
                    alert("Mod " + meta.id + " has invalid minimumGameVersion: " + minimumGameVersion);
                    continue;
                }
                if (!semverSatisifies(G_BUILD_VERSION, minimumGameVersion)) {
                    alert(
                        "Mod  '" +
                            meta.id +
                            "' is incompatible with this version of the game: \n\n" +
                            "Mod requires version " +
                            minimumGameVersion +
                            " but this game has version " +
                            G_BUILD_VERSION
                    );
                    continue;
                }
            }

            const entry = {
                meta,
                modClass,
                enabled: modStateMap[meta.id] !== false,
            };
            this.modEntries.push(entry);

            if (!entry.enabled) {
                continue;
            }

            try {
                const mod = await this.createModInstance(entry);
                this.mods.push(mod);
            } catch (ex) {
                console.error(ex);
                alert("Failed to initialize mods (launch with --dev for more info): \n\n" + ex);
            }
        }

        this.modLoadQueue = [];
        this.initialized = true;
    }
}

export const MODS = new ModLoader();
