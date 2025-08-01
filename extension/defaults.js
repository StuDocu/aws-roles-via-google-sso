const storage = getApi().storage.local;
//default values for options.
const defaults = {
	organization_domain: "",
	google_spid: "",
	google_idpid: "",
	saml_provider: "GoogleLogin",
	refresh_interval: 59,
	session_duration: 3600,
	platform: getPlatform(),
	clientupdate: true,
	idp_type: "google",
	aws_account_mappings: "",
	aws_account_mappings_parsed: {},
};

function getPlatform() {
	return navigator?.userAgentData?.platform || navigator?.platform || "unknown";
}

function getApi() {
	if (typeof chrome !== "undefined") {
		if (typeof browser !== "undefined") {
			return browser;
		}
		return chrome;
	}
}

async function main() {
	const props = await storage.get(null);
	//set default values if undefined or empty
	for (const item of Object.keys(defaults)) {
		if (!(item in props) || props[item] === undefined || props[item] === "") {
			storage.set({ [item]: defaults[item] });
		}
	}
}

main();
