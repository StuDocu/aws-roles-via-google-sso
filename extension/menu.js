// AWS Account ID to friendly name mapping will be loaded from storage

const storage = getApi().storage.local;

document.querySelector("#go-to-options").addEventListener("click", () => {
	if (chrome.runtime.openOptionsPage) {
		chrome.runtime.openOptionsPage();
	} else {
		window.open(chrome.runtime.getURL("options.html"));
	}
});

// Add tooltip to settings button
$("#go-to-options").prop("title", "Go to settings to configure AWS account names");

// Format a role value with friendly name if available
function applyFriendlyName(roleValue, accountMapping) {
	// Check if this already has a friendly name format
	const friendlyNamePattern = /^.+\((\d+)\)([:\/].*)/;
	const friendlyMatch = roleValue.match(friendlyNamePattern);

	if (friendlyMatch) {
		// It already has a friendly name, keep it as is
		return roleValue;
	}

	// Regular format: account_id:role/rolename
	const parts = roleValue.split(":");
	if (parts.length >= 2) {
		const accountId = parts[0];
		const friendlyName = accountMapping[accountId];

		if (friendlyName) {
			// Format display as "Account Name (account_id):role/rolename"
			const remainingParts = roleValue.substring(accountId.length);
			return `${friendlyName} (${accountId})${remainingParts}`;
		}
	}

	// No friendly name available or unusual format
	return roleValue;
}

function handleTextboxes(props) {
	// Populate the textboxes from local storage
	const awsAccountMapping = props.aws_account_mappings_parsed || {};
	// Track updates to store all at once for better performance
	let updates = {};

	$("input[id^='role']").each(function () {
		// Set background color based on readonly status
		$(this).css("background-color", $(this).prop("readonly") ? "#cccccc" : "#ffffff");

		const id = $(this).attr("id");
		const currentRoleTxtBox = $(this);

		if (typeof props[id] !== "undefined") {
			// Get the original value if it exists, otherwise use the stored value
			const originalKey = `${id}_original`;
			const roleValue = props[originalKey] || props[id];

			// Check if this value already has a friendly name format
			const hasFormattedName = roleValue.match(/^.+\((\d+)\)([:\/].*)$/);

			if (hasFormattedName) {
				// Already formatted, just use as is
				currentRoleTxtBox.val(roleValue);
			} else {
				// Apply friendly name formatting
				const formattedValue = applyFriendlyName(roleValue, awsAccountMapping);
				currentRoleTxtBox.val(formattedValue);

				// If we applied a friendly name, store the original for API calls
				if (formattedValue !== roleValue) {
					const match = formattedValue.match(/^.+\((\d+)\)([:\/].*)$/);
					if (match) {
						const originalValue = match[1] + match[2];
						updates[`${id}_original`] = originalValue;
						updates[id] = formattedValue;
					}
				}
			}
		}
	});

	// Save all updates at once for better performance
	if (Object.keys(updates).length > 0) {
		storage.set(updates);
	}
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

async function buildMenu(props) {
	$("#grid").empty();
	for (let i = 0; i < Number.parseInt(props.roleCount); i++) {
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
	// Get all stored data
	const props = await storage.get(null);

	if (props.roleCount === undefined) {
		storage.set({ roleCount: 1 });
		$("#go-to-options").click();
		return;
	}

	// Ensure we have the latest account mappings
	storage.get(["aws_account_mappings_parsed"], (mappingData) => {
		// Merge the latest mappings with the props
		const updatedProps = {
			...props,
			aws_account_mappings_parsed: mappingData.aws_account_mappings_parsed || {}
		};

		buildMenu(updatedProps);
	});

	$("#clibtn").hover(function () {
		alert($(this).prop("title"));
	});

	$('[id^="refresh-roles"]').click(() => {
		// Show loading message
		$("#msg").text("Refreshing roles...").css("backgroundColor", "#3498db").show();

		storage.set({ autofill: 1 });
		const port = chrome.runtime.connect({
			name: "talk to background.js",
		});
		port.postMessage("role_refresh");
		port.onMessage.addListener((msg) => {
			if (msg === "roles_refreshed") {
				$("#msg").text("Roles refreshed successfully!").css("backgroundColor", "#2ecc71").show().delay(1000).fadeOut();
				setTimeout(() => {
					location.reload();
				}, 1000);
			} else if (msg.includes("err")) {
				storage.get(["last_msg_detail"], (result) => {
					$("#msg").text(result.last_msg_detail).css("backgroundColor", "#e74c3c").show();
				});
			} else {
				console.log(`Service worker response:${msg}`);
			}
		});
	});

	// No reload UI handler needed - account mappings are applied automatically

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
		const displayValue = $(this).val();
		let roleValue = displayValue;

		// Get account mappings from storage
		storage.get(["aws_account_mappings_parsed"], (data) => {
			const awsAccountMapping = data.aws_account_mappings_parsed || {};

			// If the user entered a plain account ID, check if we have a friendly name for it
			// Check for the regular format: account_id:role/rolename
			if (roleValue.match(/^\d+:role\//)) {
				const accountId = roleValue.split(":")[0];
				const friendlyName = awsAccountMapping[accountId];

				if (friendlyName) {
					// Update the display to include the friendly name
					const remainingParts = roleValue.substring(accountId.length);
					const formattedValue = `${friendlyName} (${accountId})${remainingParts}`;
					$(this).val(formattedValue);

					// Store the original value for proper API calls
					storage.set({ [`${roleName}_original`]: roleValue });

					// Update the display value for storage
					roleValue = formattedValue;
				}
			}
			// If the user entered something with a friendly name pattern, extract the original format
			else if (displayValue.match(/^.+\((\d+)\)(.*)$/)) {
				const match = displayValue.match(/^.+\((\d+)\)(.*)$/);
				if (match) {
					// Store the original value in the format AWS expects
					const originalValue = match[1] + match[2];
					storage.set({ [`${roleName}_original`]: originalValue });
				}
			}

			// Always store the display value
			storage.set({
				[roleName]: roleValue
			});
		});
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

				// Get the role value for further processing if needed
				const displayValue = $(this).val();
				// Extract the original account ID:role/rolename format if it includes a friendly name
				let originalValue = displayValue;

				// Check if the value has a friendly name format: "Name (account_id):role/rolename" or other variations
				const match = displayValue.match(/^.+\((\d+)\)([:\/].*)$/);
				if (match) {
					// Reconstruct the original value with account ID only
					originalValue = match[1] + match[2];
					// Store the original value for use in other functions
					storage.set({ [`${$(this).attr("id")}_original`]: originalValue });
				}
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
