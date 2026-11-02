(function () {
  "use strict";

  var root = document.documentElement;
  var toggle = document.getElementById("themeToggle");

  function paintIcon() {
    var dark = root.dataset.theme === "dark";
    toggle.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    toggle.setAttribute("aria-pressed", String(dark));
  }

  function apply(theme) {
    root.dataset.theme = theme;
    localStorage.setItem("theme", theme);
    paintIcon();
  }

  if (toggle) {
    paintIcon();
    toggle.addEventListener("click", function () {
      apply(root.dataset.theme === "dark" ? "light" : "dark");
    });
  }

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function (event) {
    if (!localStorage.getItem("theme")) {
      apply(event.matches ? "dark" : "light");
    }
  });

  var year = document.getElementById("year");
  if (year) {
    year.textContent = String(new Date().getFullYear());
  }

  var items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    items.forEach(function (item) {
      item.classList.add("is-visible");
    });
    return;
  }

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.15 }
  );

  items.forEach(function (item) {
    observer.observe(item);
  });
})();
