import { openStandaloneLink, THIRDPARTY_URLS } from "../core/config";
import { WEB_STEAM_SSO_AUTHENTICATED } from "../core/steam_sso";
import { TextualGameState } from "../core/textual_game_state";
import { MODS } from "../mods/modloader";
import { T } from "../translations";

export class ModsState extends TextualGameState {
    constructor() {
        super("ModsState");
    }

    getStateHeaderTitle() {
        return T.mods.title;
    }

    get modsSupported() {
        return (
            !WEB_STEAM_SSO_AUTHENTICATED &&
            !G_IS_STEAM_DEMO &&
            (G_IS_STANDALONE || (G_IS_DEV && !window.location.href.includes("demo")))
        );
    }

    internalGetFullHtml() {
        let headerHtml = `
            <div class="headerBar">
                <h1><button class="backButton"></button> ${this.getStateHeaderTitle()}</h1>

                <div class="actions">
                   ${
                       this.modsSupported && MODS.getModEntries().length > 0
                           ? `<button class="styledButton browseMods">${T.mods.browseMods}</button>`
                           : ""
                   }
                   ${
                       this.modsSupported
                           ? `<button class="styledButton openModsFolder">${T.mods.openFolder}</button>`
                           : ""
                   }
                </div>

            </div>`;

        return `
            ${headerHtml}
            <div class="container">
                    ${this.getInnerHTML()}
            </div>
        `;
    }

    getMainContentHTML() {
        if (!this.modsSupported) {
            return `
                <div class="noModSupport">

                    <p>${WEB_STEAM_SSO_AUTHENTICATED ? T.mods.browserNoSupport : T.mods.noModSupport}</p>
                    <br>
                    <button class="styledButton browseMods">${T.mods.browseMods}</button>
                    <a href="#" class="steamLink steam_dlbtn_0" target="_blank">Get on Steam!</a>


                </div>
            `;
        }

        if (MODS.getModEntries().length === 0) {
            return `

            <div class="modsStats noMods">
                ${T.mods.modsInfo}

                <button class="styledButton browseMods">${T.mods.browseMods}</button>
            </div>

            `;
        }

        let modsHtml = ``;

        MODS.getModEntries().forEach(modEntry => {
            modsHtml += `
                <div class="mod">
                    <div class="mainInfo">
                        <span class="name">${modEntry.meta.name}</span>
                        <span class="description">${modEntry.meta.description}</span>
                        <a
                            class="website"
                            href="${modEntry.meta.website}"
                            target="_blank"
                        >
                            ${T.mods.modWebsite}
                        </a>
                    </div>
                    <span class="version"><strong>${T.mods.version}</strong>${modEntry.meta.version}</span>
                    <span class="author"><strong>${T.mods.author}</strong>${modEntry.meta.author}</span>
                    <div
                        class="value checkbox ${modEntry.enabled ? "checked" : ""}"
                        data-mod-id="${modEntry.meta.id}"
                    >
                        <span class="knob"></span>
                    </div>

                </div>
            `;
        });
        return `

            <div class="modsStats">
                ${T.mods.modsInfo}
            </div>

            <div class="modsList">
                ${modsHtml}
           </div>
        `;
    }

    onEnter() {
        const steamLink = this.htmlElement.querySelector(".steamLink");
        if (steamLink) {
            this.trackClicks(steamLink, this.onSteamLinkClicked);
        }
        const openModsFolder = this.htmlElement.querySelector(".openModsFolder");
        if (openModsFolder) {
            this.trackClicks(openModsFolder, this.openModsFolder);
        }
        const browseMods = this.htmlElement.querySelector(".browseMods");
        if (browseMods) {
            this.trackClicks(browseMods, this.openBrowseMods);
        }

        const checkboxes = this.htmlElement.querySelectorAll(".checkbox");
        Array.from(checkboxes).forEach(checkbox => {
            const modId = checkbox.dataset.modId;
            if (!modId) {
                return;
            }
            this.trackClicks(checkbox, () => this.toggleMod(modId));
        });
    }

    async toggleMod(modId) {
        const checkbox = this.htmlElement.querySelector(`.checkbox[data-mod-id="${modId}"]`);
        if (!checkbox) {
            return;
        }

        const shouldEnable = !checkbox.classList.contains("checked");
        checkbox.classList.toggle("checked", shouldEnable);

        try {
            await MODS.toggleModEnabled(modId, shouldEnable);
            const { restart } = this.dialogs.showInfo(
                T.dialogs.restartRequired.title,
                T.dialogs.restartRequired.text,
                this.app.platformWrapper.getSupportsRestart() ? ["later:grey", "restart:misc"] : ["ok:good"]
            );
            if (restart) {
                restart.add(() => this.app.platformWrapper.performRestart());
            }
        } catch (ex) {
            console.error(ex);
            checkbox.classList.toggle("checked", !shouldEnable);
            this.dialogs.showWarning(T.global.error, ex && ex.message ? ex.message : String(ex));
        }
    }

    openModsFolder() {
        if (!G_IS_STANDALONE) {
            this.dialogs.showWarning(T.global.error, T.mods.folderOnlyStandalone);
            return;
        }
        ipcRenderer.invoke("open-mods-folder");
    }

    openBrowseMods() {
        this.app.platformWrapper.openExternalLink(THIRDPARTY_URLS.modBrowser);
    }

    onSteamLinkClicked() {
        openStandaloneLink(this.app, "shapez_modsettings");
        return false;
    }

    getDefaultPreviousState() {
        return "SettingsState";
    }
}
