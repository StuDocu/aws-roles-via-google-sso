const storage = getApi().storage.local;
const MAX_PINNED_ROLES = 5;

document.querySelector("#go-to-options").addEventListener("click", () => {
	if (chrome.runtime.openOptionsPage) {
		chrome.runtime.openOptionsPage();
	} else {
		window.open(chrome.runtime.getURL("options.html"));
	}
});

function migratePinnedIndices(props) {
	if (
		(!props.pinnedIndices || props.pinnedIndices.length === 0) &&
		typeof props.checked === "string" &&
		props.checked.startsWith("role")
	) {
		const n = Number.parseInt(props.checked.replace("role", ""), 10);
		if (!Number.isNaN(n)) {
			props.pinnedIndices = [n];
			storage.set({ pinnedIndices: [n] });
		}
	}
	if (!props.pinnedIndices) {
		props.pinnedIndices = [];
	}
	return props;
}

function handleTextboxes(props) {
	$("input[id^='role']").each(function () {
		if ($(this).prop("readonly")) {
			$(this).css("background-color", "#cccccc");
		} else {
			$(this).css("background-color", "#ffffff");
		}
		const id = $(this).attr("id");
		const currentRoleTxtBox = $(this);
		if (typeof props[id] !== "undefined") {
			currentRoleTxtBox.val(props[id]);
		}
	});
	$("input[id^='profileSlug']").each(function () {
		const id = $(this).attr("id");
		if (typeof props[id] !== "undefined") {
			$(this).val(props[id]);
		}
	});
}

function populateCheckboxesAndButtons(props) {
	const pinned = props.pinnedIndices || [];
	for (const dataIndex of pinned) {
		$(`#enable${dataIndex}`).prop("checked", true);
		const btn = $(`#sts_button${dataIndex}`);
		if (props.last_msg && props.last_msg.includes("err")) {
			btn.css("background-image", "url(/img/err.png)");
			btn.css("visibility", "visible");
			btn.css("pointer-events", "none");
			$("#msg").text(props.last_msg_detail);
		} else if (props.stsByIndex && props.stsByIndex[dataIndex]) {
			btn.css("background-image", "url(/img/cli.png)");
			btn.css("visibility", "visible");
			btn.css("pointer-events", "");
			btn.prop("title", "Click to copy STS credentials to clipboard.");
		}
	}
}

function getSortedAccountsWithRoles(props, accountNames) {
	const roleCount = Number.parseInt(props.roleCount);
	const rolesByAccount = Array.from({ length: roleCount }, (_, i) => ({
		index: i,
		role: props[`role${i}`]
	}))
		.filter(({ role }) => role)
		.reduce((acc, { index, role }) => {
			const accountId = role.split(":")[0];
			return {
				...acc,
				[accountId]: [...(acc[accountId] || []), { index, role }]
			};
		}, {});
	
	const sortedAccounts = Object.keys(rolesByAccount).sort((a, b) => {
		const nameA = (accountNames[a] || a).toLowerCase();
		const nameB = (accountNames[b] || b).toLowerCase();
		return nameA.localeCompare(nameB);
	});
	
	return { rolesByAccount, sortedAccounts };
}

async function buildMenu(props) {
	$("#grid").empty();
	
	const accountNames = props.accountNames || {};
	const { rolesByAccount, sortedAccounts } = getSortedAccountsWithRoles(props, accountNames);
	
	for (const accountId of sortedAccounts) {
		const headerText = accountNames[accountId] || `Account ${accountId}`;
		
		jQuery("<div>", {
			class: "account-header",
			text: headerText
		}).appendTo("#grid");
		
		const sortedRoles = [...rolesByAccount[accountId]]
			.sort((a, b) => a.role.localeCompare(b.role));
		
		for (const roleInfo of sortedRoles) {
			const i = roleInfo.index;
			
			jQuery("<div>", {
				id: `item${i}`,
				class: `item${i} role-row`,
			}).appendTo("#grid");

			const textboxProperties = {
				type: "text",
				value: "",
				id: `role${i}`,
				placeholder: "Role",
				class: "txtbox",
				"data-index": i,
			};
			textboxProperties.readonly = "readonly";
			$(".txtbox").css("pointer-events", "none");
			jQuery("<input>", textboxProperties).appendTo(`#item${i}`);

			jQuery("<input>", {
				type: "text",
				value: "",
				id: `profileSlug${i}`,
				placeholder: "CLI profile",
				class: "profile-slug",
				"data-index": i,
			}).appendTo(`#item${i}`);

			jQuery("<label>", {
				id: `label${i}`,
				class: "switch btncls",
			}).appendTo(`#item${i}`);

			jQuery("<input>", {
				type: "checkbox",
				id: `enable${i}`,
				"data-index": i,
			}).appendTo(`#label${i}`);

			jQuery("<span>", {
				class: "slider round",
			}).appendTo(`#label${i}`);

			jQuery("<button>", {
				class: "button clibtn",
				id: `sts_button${i}`,
				"data-index": i,
			}).appendTo(`#item${i}`);
		}
	}
	
	handleTextboxes(props);
	populateCheckboxesAndButtons(props);
}

function getApi() {
	if (typeof chrome !== "undefined") {
		if (typeof browser !== "undefined") {
			return browser;
		}
		return chrome;
	}
}

function getPinnedIndicesFromDom() {
	const pinned = [];
	$("input[id^='enable'][type='checkbox']:checked").each(function () {
		pinned.push(Number.parseInt($(this).attr("data-index"), 10));
	});
	return pinned;
}

function showLoadingForPinned(pinned) {
	$("[id^='sts_button']").css("visibility", "hidden");
	for (const dataIndex of pinned) {
		const btn = $(`#sts_button${dataIndex}`);
		btn.css("background-image", "url(/img/loading.gif)");
		btn.css("visibility", "visible");
		btn.css("pointer-events", "none");
	}
}

function enableStsButtonsForPinned(pinned) {
	storage.get(["stsByIndex"], (result) => {
		const stsByIndex = result.stsByIndex || {};
		for (const dataIndex of pinned) {
			const btn = $(`#sts_button${dataIndex}`);
			const creds = stsByIndex[dataIndex] ?? stsByIndex[String(dataIndex)];
			if (creds) {
				btn.css("background-image", "url(/img/cli.png)");
				btn.prop("title", "Click to copy STS credentials to clipboard.");
				btn.css("pointer-events", "");
				btn.css("visibility", "visible");
			} else {
				btn.css("background-image", "url(/img/err.png)");
				btn.css("visibility", "visible");
				btn.css("pointer-events", "none");
			}
		}
	});
}

function markStsButtonsError(pinned) {
	for (const dataIndex of pinned) {
		$(`#sts_button${dataIndex}`).css("background-image", "url(/img/err.png)");
	}
	storage.get(["last_msg_detail"], (result) => {
		$("#msg").text(result.last_msg_detail);
	});
}

async function main() {
	const props = await storage.get(null);
	if (props.roleCount === undefined) {
		storage.set({ roleCount: 1 });
		$("#go-to-options").click();
	}

	migratePinnedIndices(props);
	buildMenu(props);

	$("#clibtn").hover(function () {
		alert($(this).prop("title"));
	});

	$('[id^="refresh-roles"]').click(() => {
		storage.set({ autofill: 1 });
		const port = chrome.runtime.connect({
			name: "talk to background.js",
		});
		port.postMessage("role_refresh");
		port.onMessage.addListener((msg) => {
			if (msg === "roles_refreshed") {
				location.reload();
			} else if (msg.includes("err")) {
				storage.get(["last_msg_detail"], (result) => {
					$("#msg").text(result.last_msg_detail);
				});
			} else {
				console.log(`Service worker response:${msg}`);
			}
		});
	});

	$("input[id^='role']").focus(() => {
		$("input[id^='enable'][type='checkbox']").each(function () {
			$(this).prop("checked", false);
		});
		storage.set({ pinnedIndices: [] });
		const port = chrome.runtime.connect({
			name: "talk to background.js",
		});
		port.postMessage("refreshoff");
	});
	$("input[id^='role']").focusout(function () {
		const roleName = $(this).attr("id");
		const roleValue = $(this).val();
		storage.set({ [roleName]: roleValue });
	});

	$("input[id^='profileSlug']").focusout(function () {
		const slugName = $(this).attr("id");
		storage.set({ [slugName]: $(this).val() });
	});

	$('[id^="sts_button"]').click(function () {
		const index = $(this).attr("data-index");
		if ($(`#enable${index}`).prop("checked")) {
			storage.get(["platform", "stsByIndex"], (data) => {
				const byIndex = data.stsByIndex || {};
				const creds = byIndex[index] ?? byIndex[String(index)];
				if (!creds) {
					alert("No STS credentials for this pin yet.");
					return;
				}
				let stsCommand;
				switch (data.platform.toLowerCase()) {
					case "windows":
					case "win32":
						stsCommand = "set";
						break;
					default:
						stsCommand = "export";
				}
				const stscli = `${stsCommand} AWS_ACCESS_KEY_ID=${creds.AccessKeyId} && ${stsCommand} AWS_SECRET_ACCESS_KEY=${creds.SecretAccessKey} && ${stsCommand} AWS_SESSION_TOKEN=${creds.SessionToken} && ${stsCommand} AWS_SESSION_EXPIRATION=${creds.Expiration}`;
				navigator.clipboard.writeText(stscli).then(
					() => {
						alert("token copied to clipboard");
					},
					() => {
						alert("failed copying to clipboard");
					},
				);
			});
		}
	});

	$("input[id^='enable'][type='checkbox']").change(function () {
		$("#msg").text("");
		const wasChecked = this.checked;

		if (wasChecked) {
			const currentPinned = getPinnedIndicesFromDom();
			if (currentPinned.length > MAX_PINNED_ROLES) {
				$(this).prop("checked", false);
				$("#msg").text(`You can pin at most ${MAX_PINNED_ROLES} roles.`);
				return;
			}
		}

		const pinned = getPinnedIndicesFromDom();
		storage.set({ pinnedIndices: pinned });

		const port = chrome.runtime.connect({
			name: "talk to background.js",
		});

		if (pinned.length === 0) {
			port.postMessage("refreshoff");
			$("[id^='sts_button']").css("visibility", "hidden");
			return;
		}

		showLoadingForPinned(pinned);
		port.postMessage("refreshon");
		port.onMessage.addListener((msg) => {
			if (msg === "sts_ready") {
				enableStsButtonsForPinned(pinned);
				storage.get(["last_msg_detail"], (result) => {
					if (result.last_msg_detail && result.last_msg_detail !== "success") {
						$("#msg").text(result.last_msg_detail);
					}
				});
			} else if (msg.includes("err")) {
				markStsButtonsError(pinned);
			} else {
				console.log(`Service worker response: ${msg}`);
			}
		});
	});
}

main();
