const storage = getApi().storage.local;

function getApi() {
	if (typeof chrome !== "undefined") {
		if (typeof browser !== "undefined") {
			return browser;
		}
		return chrome;
	}
}
//Save options to local storage
$(".txtbox").focusout(function () {
	const optionName = $(this).attr("id");
	const optionValue = $(this).val();
	const obj = {
		[optionName]: optionValue,
	};
	storage.set(obj);
});

// Save textarea content to local storage
$(".textareabox").focusout(function () {
	const optionName = $(this).attr("id");
	const optionValue = $(this).val();

	// Parse account mappings into an object
	if (optionName === "aws_account_mappings") {
		const mappings = {};
		const lines = optionValue.split("\n");

		lines.forEach(line => {
			// Skip empty lines
			if (line.trim() === "") return;

			// Expected format: "accountId: Friendly Name"
			const parts = line.split(":");
			if (parts.length >= 2) {
				const accountId = parts[0].trim();
				const friendlyName = parts.slice(1).join(":").trim();
				if (accountId && friendlyName) {
					mappings[accountId] = friendlyName;
				}
			}
		});

		// Save both the raw text and the parsed object
		storage.set({
			[optionName]: optionValue,
			"aws_account_mappings_parsed": mappings
		});
	} else {
		storage.set({
			[optionName]: optionValue
		});
	}
});

//Save checkboxes values to local storage
$(":checkbox").change(function () {
	const optionName = $(this).attr("id");
	const optionValue = $(this).prop("checked");
	const obj = {
		[optionName]: optionValue,
	};
	storage.set(obj);
});
// Save dropdown menu options
$("select").change(function () {
	const optionName = $(this).attr("id");
	const optionValue = $(this).val();
	const obj = {
		[optionName]: optionValue,
	};
	storage.set(obj);
});

function loadOptions() {
	storage.get(
		["saml_provider", "organization_domain", "google_idpid", "google_spid"],
		(props) => {
			$(".txtbox").each(function () {
				$(this).val(props[$(this).prop("id")]);
			});
		},
	);

	storage.get("idp_type", (props) => {
		$("select").each(function () {
			$(this).val(props[$(this).prop("id")]);
		});
	});

	storage.get("clientupdate", (props) => {
		$(".chkbox").each(function () {
			$(this).prop("checked", props[$(this).prop("id")]);
		});
	});

	storage.get("aws_account_mappings", (props) => {
		$("#aws_account_mappings").val(props.aws_account_mappings || "");
	});
}

//display help information
$("img[id^='infoPic']")
	.hover(function () {
		$(".layout").css("display", "block");
		$(".layout").text($(this).attr("alt"));
	})
	.mouseover(function (event) {
		const left = event.pageX - $(this).offset().left + 100;
		const top = $(this).offset().top - window.scrollY - 32;
		$(".layout").css({ top: top, left: left });
		$(".layout").css("display", "block");
	})
	.mouseleave(() => {
		$(".layout").css("display", "none");
		$(".layout").text("");
	});

$(".tablinks").click(function () {
	const id = $(this).prop("id");
	$(".grid-container").each(function () {
		if ($(this).prop("id") === id) {
			$(this).css("display", "grid");
		} else {
			$(this).css("display", "none");
		}
	});
});

// Handle Save Account Mappings button click
$("#save_mappings").click(function() {
    const optionValue = $("#aws_account_mappings").val();
    const mappings = {};
    const lines = optionValue.split("\n");

    lines.forEach(line => {
        // Skip empty lines
        if (line.trim() === "") return;

        // Expected format: "accountId: Friendly Name"
        const parts = line.split(":");
        if (parts.length >= 2) {
            const accountId = parts[0].trim();
            const friendlyName = parts.slice(1).join(":").trim();
            if (accountId && friendlyName) {
                mappings[accountId] = friendlyName;
            }
        }
    });

    // Save both the raw text and the parsed object
    storage.set({
        "aws_account_mappings": optionValue,
        "aws_account_mappings_parsed": mappings
    }, function() {
        // Show success message
        $("#mapping_status").text("Account mappings saved successfully!").fadeIn().delay(2000).fadeOut();
    });
});

$(document).ready(loadOptions);
