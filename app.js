(function () {
  var FORM_ENDPOINT = "/api/forms";
  var STATUS_STATES = ["is-error", "is-success", "is-loading"];
  var raf =
    window.requestAnimationFrame ||
    function (callback) {
      return window.setTimeout(callback, 16);
    };

  function each(nodes, callback) {
    var i;
    if (!nodes || !callback) return;
    for (i = 0; i < nodes.length; i += 1) callback(nodes[i], i);
  }

  function hasClass(el, className) {
    if (!el) return false;
    if (el.classList && el.classList.contains) return el.classList.contains(className);
    return new RegExp("(^|\\s)" + className + "(\\s|$)").test(el.className || "");
  }

  function addClass(el, className) {
    if (!el) return;
    if (el.classList && el.classList.add) {
      el.classList.add(className);
      return;
    }
    if (!hasClass(el, className)) {
      el.className = el.className ? el.className + " " + className : className;
    }
  }

  function removeClass(el, className) {
    if (!el) return;
    if (el.classList && el.classList.remove) {
      el.classList.remove(className);
      return;
    }
    el.className = (el.className || "")
      .replace(new RegExp("(^|\\s)" + className + "(\\s|$)", "g"), " ")
      .replace(/\s+/g, " ")
      .replace(/^\s+|\s+$/g, "");
  }

  function addListener(target, eventName, handler, options) {
    if (!target || !target.addEventListener) return;
    try {
      target.addEventListener(eventName, handler, options || false);
    } catch (error) {
      target.addEventListener(eventName, handler, false);
    }
  }

  function safeFocus(el, preventScroll) {
    if (!el || typeof el.focus !== "function") return;
    if (preventScroll) {
      try {
        el.focus({ preventScroll: true });
        return;
      } catch (error) {}
    }
    try {
      el.focus();
    } catch (error) {}
  }

  function setStatus(el, message, state) {
    var i;
    if (!el) return;
    el.textContent = message || "";
    for (i = 0; i < STATUS_STATES.length; i += 1) removeClass(el, STATUS_STATES[i]);
    if (state) addClass(el, state);
  }

  function stampFormStart(form) {
    var startedAt;
    if (!form) return;
    startedAt = form.querySelector('input[name="startedAt"]');
    if (startedAt) startedAt.value = String(new Date().getTime());
  }

  function setSubmitBusy(form, busy, busyLabel) {
    var submit;
    var defaultLabel;
    var defaultHtml;
    if (!form) return;
    submit = form.querySelector('button[type="submit"]');
    if (!submit) return;
    defaultLabel =
      submit.getAttribute("data-default-label") || submit.textContent.replace(/^\s+|\s+$/g, "");
    defaultHtml = submit.getAttribute("data-default-html") || submit.innerHTML;
    submit.setAttribute("data-default-label", defaultLabel);
    submit.setAttribute("data-default-html", defaultHtml);
    submit.disabled = !!busy;
    if (busy && busyLabel) submit.textContent = busyLabel;
    else submit.innerHTML = defaultHtml;
  }

  function safeJsonParse(text) {
    try {
      return text ? JSON.parse(text) : {};
    } catch (error) {
      return {};
    }
  }

  function serializeForm(form) {
    var values = {};
    var elements = form && form.elements ? form.elements : [];
    var field;
    var tagName;
    var type;
    var options;
    var selected;
    var i;
    var j;

    for (i = 0; i < elements.length; i += 1) {
      field = elements[i];
      if (!field || field.disabled || !field.name) continue;

      tagName = (field.tagName || "").toLowerCase();
      type = (field.type || "").toLowerCase();

      if (type === "submit" || type === "button" || type === "reset" || type === "file") continue;
      if ((type === "checkbox" || type === "radio") && !field.checked) continue;

      if (tagName === "select" && field.multiple) {
        options = field.options || [];
        selected = [];
        for (j = 0; j < options.length; j += 1) {
          if (options[j].selected) selected.push(options[j].value);
        }
        values[field.name] = selected;
        continue;
      }

      values[field.name] = field.value;
    }

    return values;
  }

  function validateForm(form) {
    if (!form) return false;
    if (typeof form.reportValidity === "function") return form.reportValidity();
    if (typeof form.checkValidity === "function") return form.checkValidity();
    return true;
  }

  function postForm(payload, onSuccess, onError) {
    var request;
    var completed = false;

    function fail(message) {
      if (completed) return;
      completed = true;
      if (onError) onError(message);
    }

    function succeed(data) {
      if (completed) return;
      completed = true;
      if (onSuccess) onSuccess(data);
    }

    if (!window.XMLHttpRequest || !window.JSON || typeof JSON.stringify !== "function") {
      fail("This browser is too old to send the form automatically. Please email us directly.");
      return;
    }

    request = new XMLHttpRequest();
    request.open("POST", FORM_ENDPOINT, true);
    request.setRequestHeader("Content-Type", "application/json");
    request.setRequestHeader("Accept", "application/json");

    request.onreadystatechange = function () {
      var data;
      var message;
      if (request.readyState !== 4) return;

      data = safeJsonParse(request.responseText);
      if (request.status >= 200 && request.status < 300) {
        succeed(data);
        return;
      }

      message = data && data.error ? data.error : "Something went wrong. Please try again.";
      fail(message);
    };

    request.onerror = function () {
      fail("Network error. Please try again.");
    };

    try {
      request.send(JSON.stringify(payload));
    } catch (error) {
      fail("This browser could not send the form. Please email us directly.");
    }
  }

  function bindNewsletterForm() {
    var form = document.getElementById("newsletterForm");
    var status = document.getElementById("newsletterStatus");
    if (!form || !status) return;

    stampFormStart(form);

    addListener(form, "submit", function (event) {
      var payload;
      if (event && typeof event.preventDefault === "function") event.preventDefault();
      if (!validateForm(form)) return;

      payload = serializeForm(form);
      setSubmitBusy(form, true, "Sending...");
      setStatus(status, "Sending request...", "is-loading");

      postForm(
        payload,
        function () {
          form.reset();
          stampFormStart(form);
          setStatus(status, "Thanks. You are on the list.", "is-success");
          setSubmitBusy(form, false);
        },
        function (message) {
          setStatus(status, message, "is-error");
          setSubmitBusy(form, false);
        }
      );
    });
  }

  function bindSponsorForm() {
    var form = document.getElementById("sponsorForm");
    var status = document.getElementById("sponsorStatus");
    var sponsorApply = document.getElementById("sponsorApply");
    if (!form || !status || !sponsorApply) return;

    stampFormStart(form);

    addListener(form, "submit", function (event) {
      var payload;
      if (event && typeof event.preventDefault === "function") event.preventDefault();
      if (!validateForm(form)) return;

      payload = serializeForm(form);
      setSubmitBusy(form, true, "Sending...");
      setStatus(status, "Submitting application...", "is-loading");

      postForm(
        payload,
        function () {
          addClass(sponsorApply, "submitted");
          form.reset();
          stampFormStart(form);
          setStatus(status, "", null);
          setSubmitBusy(form, false);
        },
        function (message) {
          setStatus(status, message, "is-error");
          setSubmitBusy(form, false);
        }
      );
    });
  }

  function bindAnchorScroll() {
    var triggers = document.querySelectorAll('a[href^="#"], [data-scroll-target]');
    if (!triggers.length) return;

    function getTargetId(el) {
      var dataTarget = el.getAttribute("data-scroll-target");
      var href;
      if (dataTarget) return dataTarget;
      href = el.getAttribute("href");
      if (href && href !== "#" && href.length > 1) return href.slice(1);
      return null;
    }

    each(triggers, function (trigger) {
      var targetId = getTargetId(trigger);
      if (!targetId) return;

      addListener(trigger, "click", function (event) {
        var target;
        var wasMenuOpen;

        if (event && typeof event.preventDefault === "function") event.preventDefault();

        target = document.getElementById(targetId);
        if (!target) return;

        wasMenuOpen = hasClass(document.body, "menu-open");
        if (wasMenuOpen) {
          removeClass(document.body, "menu-open");
          if (document.body) document.body.style.overflow = "";
          safeSetExpanded("navToggle", "false");
        }

        function doScroll() {
          try {
            target.scrollIntoView({ behavior: "smooth", block: "start" });
          } catch (error) {
            target.scrollIntoView(true);
          }
          try {
            if (history.pushState) history.pushState(null, "", "#" + targetId);
          } catch (pushStateError) {}
        }

        if (wasMenuOpen) raf(doScroll);
        else doScroll();
      });
    });
  }

  function bindCopyTriggers() {
    var triggers = document.querySelectorAll("[data-copy]");
    if (!triggers.length) return;

    function fallbackCopy(text) {
      var textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
      } catch (error) {}
      document.body.removeChild(textarea);
    }

    each(triggers, function (el) {
      addListener(el, "click", function (event) {
        var text = el.getAttribute("data-copy");
        if (event && typeof event.preventDefault === "function") event.preventDefault();
        if (!text) return;

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(
            function () {},
            function () {
              fallbackCopy(text);
            }
          );
        } else {
          fallbackCopy(text);
        }
      });
    });
  }

  function safeSetExpanded(id, value) {
    var el = document.getElementById(id);
    if (el) el.setAttribute("aria-expanded", value);
  }

  function bindModals() {
    var modals = document.querySelectorAll(".modal-overlay");
    var triggerEl = null;

    function openModal(modal) {
      removeClass(document.body, "menu-open");
      if (document.body) document.body.style.overflow = "hidden";
      safeSetExpanded("navToggle", "false");

      addClass(modal, "is-open");
      modal.setAttribute("aria-hidden", "false");

      safeFocus(modal.querySelector("[data-modal-close]"), true);
    }

    function closeModal(modal) {
      removeClass(modal, "is-open");
      modal.setAttribute("aria-hidden", "true");
      if (document.body) document.body.style.overflow = "";
      if (triggerEl) safeFocus(triggerEl, false);
      triggerEl = null;
    }

    if (!modals.length) return;

    each(document.querySelectorAll("[data-modal-open]"), function (el) {
      addListener(el, "click", function (event) {
        var id;
        var modal;
        if (event && typeof event.preventDefault === "function") event.preventDefault();
        id = el.getAttribute("data-modal-open");
        modal = document.getElementById(id);
        if (!modal) return;
        triggerEl = el;
        openModal(modal);
      });
    });

    each(modals, function (modal) {
      each(modal.querySelectorAll("[data-modal-close]"), function (el) {
        addListener(el, "click", function () {
          closeModal(modal);
        });
      });

      addListener(modal, "click", function (event) {
        if (event.target === modal) closeModal(modal);
      });
    });

    addListener(document, "keydown", function (event) {
      var key = event.key || event.keyCode;
      if (key !== "Escape" && key !== 27) return;
      each(modals, function (modal) {
        if (hasClass(modal, "is-open")) closeModal(modal);
      });
    });
  }

  function bindScrollTop() {
    var triggers = document.querySelectorAll("[data-scroll-top]");
    if (!triggers.length) return;

    each(triggers, function (el) {
      addListener(el, "click", function (event) {
        if (event && typeof event.preventDefault === "function") event.preventDefault();
        try {
          window.scrollTo({ top: 0, behavior: "smooth" });
        } catch (error) {
          window.scrollTo(0, 0);
        }
        try {
          if (history.pushState) history.pushState(null, "", window.location.pathname);
        } catch (pushStateError) {}
      });
    });
  }

  function bindMobileStickyCta() {
    var cta = document.querySelector(".mobile-sticky-cta");
    var hero = document.querySelector(".hero");
    var ticking = false;

    function update() {
      var heroBottom = hero.getBoundingClientRect().bottom;
      if (heroBottom > 80) addClass(cta, "is-hidden");
      else removeClass(cta, "is-hidden");
      ticking = false;
    }

    if (!cta || !hero) return;

    addListener(window, "scroll", function () {
      if (ticking) return;
      ticking = true;
      raf(update);
    });

    update();
  }

  function bindMobileNav() {
    var toggle = document.getElementById("navToggle");
    var menu = document.getElementById("mobileMenu");
    var resizeTimer;

    function openMenu() {
      addClass(document.body, "menu-open");
      if (document.body) document.body.style.overflow = "hidden";
      toggle.setAttribute("aria-expanded", "true");
      menu.setAttribute("aria-hidden", "false");
      toggle.setAttribute("aria-label", "Close menu");
    }

    function closeMenu() {
      removeClass(document.body, "menu-open");
      if (document.body) document.body.style.overflow = "";
      toggle.setAttribute("aria-expanded", "false");
      menu.setAttribute("aria-hidden", "true");
      toggle.setAttribute("aria-label", "Open menu");
    }

    if (!toggle || !menu) return;

    addListener(toggle, "click", function () {
      if (hasClass(document.body, "menu-open")) closeMenu();
      else openMenu();
    });

    each(menu.querySelectorAll("a, button"), function (el) {
      addListener(el, "click", closeMenu);
    });

    addListener(document, "keydown", function (event) {
      var key = event.key || event.keyCode;
      if ((key === "Escape" || key === 27) && hasClass(document.body, "menu-open")) closeMenu();
    });

    addListener(window, "resize", function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        if (window.innerWidth > 880 && hasClass(document.body, "menu-open")) closeMenu();
      }, 150);
    });
  }

  function bindRevealOnScroll() {
    var els = document.querySelectorAll(".reveal");
    var io;
    if (!els.length) return;

    if (!("IntersectionObserver" in window)) {
      each(els, function (el) {
        addClass(el, "in");
      });
      return;
    }

    io = new IntersectionObserver(
      function (entries) {
        each(entries, function (entry) {
          if (entry.isIntersecting) {
            addClass(entry.target, "in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    each(els, function (el) {
      io.observe(el);
    });
  }

  function bindCountdown() {
    var target = Date.UTC(2026, 5, 5, 23, 0, 0);
    var d = document.getElementById("cd-d");
    var h = document.getElementById("cd-h");
    var m = document.getElementById("cd-m");
    var s = document.getElementById("cd-s");

    function pad(number) {
      return number < 10 ? "0" + number : String(number);
    }

    function tick() {
      var now = new Date().getTime();
      var diff = target - now;
      var days;
      var hours;
      var mins;
      var secs;

      if (diff < 0) diff = 0;

      days = Math.floor(diff / 86400000);
      diff -= days * 86400000;
      hours = Math.floor(diff / 3600000);
      diff -= hours * 3600000;
      mins = Math.floor(diff / 60000);
      diff -= mins * 60000;
      secs = Math.floor(diff / 1000);

      d.textContent = String(days);
      if (h) h.textContent = pad(hours);
      if (m) m.textContent = pad(mins);
      if (s) s.textContent = pad(secs);
    }

    if (!d) return;
    tick();
    window.setInterval(tick, 1000);
  }

  function init() {
    bindNewsletterForm();
    bindSponsorForm();
    bindAnchorScroll();
    bindCopyTriggers();
    bindModals();
    bindScrollTop();
    bindMobileStickyCta();
    bindMobileNav();
    bindRevealOnScroll();
    bindCountdown();
  }

  if (document.readyState === "loading") addListener(document, "DOMContentLoaded", init);
  else init();
})();
