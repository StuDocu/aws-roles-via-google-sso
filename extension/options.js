const storage = getApi().storage.local;

function getApi() {
  if (typeof chrome !== "undefined") {
    if (typeof browser !== "undefined") {
      return browser;
    }
    return chrome;
  }
}

// Populate the container dropdown
async function populateContainers() {
  const api = getApi();
  if (api.contextualIdentities) {
    try {
      const containers = await api.contextualIdentities.query({});
      const select = document.getElementById("container_id");

      for (const container of containers) {
        const option = document.createElement("option");
        option.value = container.cookieStoreId;
        option.textContent = container.name;
        select.appendChild(option);
      }

      // Set saved value
      const props = await storage.get("container_id");
      if (props.container_id) {
        select.value = props.container_id;
      }
    } catch (e) {
      console.log("Containers not available:", e);
    }
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

//Save checkboxes values to local storage
$(":checkbox").change(function () {
  const optionName = $(this).attr("id");
  const optionValue = $(this).prop("checked");
  const obj = {
    [optionName]: optionValue,
  };
  storage.set(obj);
});

// Save dropdown menu options (including container selector)
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

  // Load containers
  populateContainers();
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

$(document).ready(loadOptions);
