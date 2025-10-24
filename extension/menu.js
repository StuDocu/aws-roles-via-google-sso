const storage = getApi().storage.local;

document.querySelector("#go-to-options").addEventListener("click", () => {
	if (chrome.runtime.openOptionsPage) {
		chrome.runtime.openOptionsPage();
	} else {
		window.open(chrome.runtime.getURL("options.html"));
	}
});

function handleTextboxes(props) {
	//populate the textboxes from local storage
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
}

function populateCheckboxesAndButtons(props) {
	//get the currently checked checkbox
	if (typeof props.checked !== "undefined") {
		const dataIndex = $(`#${props.checked}`).attr("data-index");
		//find the checkbox with the same data-index as the role and set it as checked.
		$(`input[id^='enable'][type='checkbox'][data-index=${dataIndex}]`).each(
			function () {
				$(this).prop("checked", true);
			},
		);
		//enable the relevant sts button if something is already checked.
		$(`[id^='sts_button'][data-index=${dataIndex}]`).each(function () {
			if (props.last_msg.includes("err")) {
				$(this).css("background-image", "url(/img/err.png)");
				$(this).css("visibility", "visible");
				$(this).css("pointer-events", "none");
				$("#msg").text(props.last_msg_detail);
			} else {
				$(this).css("visibility", "visible");
			}
		});
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
				class: `item${i}`,
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
async function main() {
	//need to refresh it again..
	const props = await storage.get(null);
	if (props.roleCount === undefined) {
		storage.set({ roleCount: 1 });
		$("#go-to-options").click();
	}

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

	//uncheck all checkboxes when modifying role ARNs
	$("input[id^='role']").focus(() => {
		$("input[id^='enable'][type='checkbox']").each(function (index, obj) {
			$(this).prop("checked", false);
		});
		const port = chrome.runtime.connect({
			name: "talk to background.js",
		});
		port.postMessage("refreshoff");
	});
	//Save data to local storage automatically when not focusing on TxtBox
	$("input[id^='role']").focusout(function () {
		const roleName = $(this).attr("id");
		const roleValue = $(this).val();
		const obj = {
			[roleName]: roleValue,
		};
		storage.set(obj);
	});
	//get the STS token from storage when clicking the CLI button.
	$('[id^="sts_button"]').click(function () {
		const index = $(this).attr("data-index");
		if ($(`#enable${index}`).prop("checked")) {
			storage.get(
				[
					"platform",
					"awsAccessKeyId",
					"awsSecretAccessKey",
					"awsSessionToken",
					"awsExpiration",
				],
				(data) => {
					let stsCommand;
					switch (data.platform.toLowerCase()) {
						case "windows":
						case "win32":
							stsCommand = "set";
							break;
						default:
							stsCommand = "export";
					}
					const stscli = `${stsCommand} AWS_ACCESS_KEY_ID=${data.awsAccessKeyId} && ${stsCommand} AWS_SECRET_ACCESS_KEY=${data.awsSecretAccessKey} && ${stsCommand} AWS_SESSION_TOKEN=${data.awsSessionToken} && ${stsCommand} AWS_SESSION_EXPIRATION=${data.awsExpiration}`;
					navigator.clipboard.writeText(stscli).then(
						() => {
							alert("token copied to clipboard");
						},
						() => {
							alert("failed copying to clipboard");
						},
					);
				},
			);
		}
	});
	//Action when a checkbox is changed
	$("input[id^='enable'][type='checkbox']").change(function () {
		$("#msg").text("");
		const id = $(this).attr("id");
		const dataIndex = $(this).attr("data-index");
		// hide all sts buttons
		$("[id^='sts_button']").each(function () {
			$(this).css("visibility", "hidden");
		});
		if (!this.checked) {
			const port = chrome.runtime.connect({
				name: "talk to background.js",
			});
			port.postMessage("refreshoff");
		} else {
			//uncheck other checkboxes.
			$("input[id^='enable'][type='checkbox']").each(function () {
				if ($(this).attr("id") !== id) {
					$(this).prop("checked", false);
				}
			});
			//enable sts loading button
			$(`[id^='sts_button'][data-index=${dataIndex}]`).each(function () {
				$(this).css("background-image", "url(/img/loading.gif)");
				$(this).css("visibility", "visible");
				$(this).css("pointer-events", "none");
			});
			//set the roleTxtBox with the same data-index as the as checked.
			$(`input[id^='role'][data-index=${dataIndex}]`).each(function () {
				storage.set({ checked: $(this).attr("id") });
			});
			//start background service functions
			const port = chrome.runtime.connect({
				name: "talk to background.js",
			});
			port.postMessage("refreshon");
			port.onMessage.addListener((msg) => {
				//if sts fetch went fine enable the cli button.
				if (msg === "sts_ready") {
					$(`[id^='sts_button'][data-index=${dataIndex}]`).each(function () {
						$(this).css("background-image", "url(/img/cli.png)");
						$(this).prop(
							"title",
							"Click to copy STS credentials to clipboard.",
						);
						$(this).css("pointer-events", "");
					});
				} else if (msg.includes("err")) {
					$(`[id^='sts_button'][data-index=${dataIndex}]`).each(function () {
						$(this).css("background-image", "url(/img/err.png)");
						storage.get(["last_msg_detail"], (result) => {
							$("#msg").text(result.last_msg_detail);
						});
					});
				} else {
					console.log(`Service worker response: ${msg}`);
				}
			});
		}
	});
}

main();
