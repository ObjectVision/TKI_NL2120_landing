(function () {
  var frames = Array.prototype.slice.call(document.querySelectorAll(".kaart-frame"));

  // The map announces itself once booted; answer with a reduced interface.
  window.addEventListener("message", function (event) {
    if (!event.data || event.data.type !== "map-ready") return;
    frames.forEach(function (frame) {
      var iframe = frame.querySelector("iframe");
      if (iframe.contentWindow !== event.source) return;
      if (event.origin !== new URL(iframe.src).origin) return;
      event.source.postMessage(
        { type: "map-config", navigation: false, searchbar: false, streetview: false, share: false, annotations: false },
        event.origin
      );
    });
  });

  // The map captures the scroll wheel, so it only takes input after a click.
  frames.forEach(function (frame) {
    frame.querySelector(".kaart-activeer").addEventListener("click", function () {
      frame.classList.add("is-actief");
    });
    frame.addEventListener("mouseleave", function () {
      frame.classList.remove("is-actief");
    });
  });
  document.addEventListener("pointerdown", function (event) {
    frames.forEach(function (frame) {
      if (!frame.contains(event.target)) frame.classList.remove("is-actief");
    });
  });
})();
