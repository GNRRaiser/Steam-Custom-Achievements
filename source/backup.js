  function copyText(text, caption) {
    if (window.navigator?.clipboard?.writeText) {
      window.navigator.clipboard.writeText(text).then(() => showMessage(`${caption} copied to clipboard`))
        .catch(() => showBackup(text, false, caption));
    } else showBackup(text, false, caption);
  }

  function exportBackup() {
    copyText(JSON.stringify({version:1, appId:game.appId, progress:game.progress}, null, 2), "Backup");
  }

  function showBackup(value, restoreMode = false, caption = "Backup") {
    const panel = document.getElementById(DIALOG_ID)?.querySelector(".sca-backup-area");
    if (!panel) return;
    panel.querySelector(".sca-editor")?.remove();
    const drawer = el("div", "sca-editor");
    const label = el("p", "", restoreMode ? `Paste a ${game.title} backup, then replace your current progress.` : `${caption}: select and copy the text below.`);
    const input = el("textarea", "sca-backup");
    input.value = value;
    input.rows = 5;
    input.readOnly = !restoreMode;
    input.setAttribute("aria-label", restoreMode ? "Backup to restore" : `${caption} JSON`);
    const actions = el("div", "sca-footer");
    const cancel = el("button", "sca-small", "Close");
    cancel.type = "button";
    cancel.onclick = () => drawer.remove();
    actions.appendChild(cancel);
    if (restoreMode) {
      const apply = el("button", "sca-small", "Replace progress");
      apply.type = "button";
      apply.onclick = () => {
        try {
          const data = JSON.parse(input.value);
          const clean = cleanProgress(game, data?.progress);
          if (data?.version !== 1 || data?.appId !== game.appId || clean === null) throw new Error("Invalid backup");
          game.progress = clean;
          writeProgress(game);
          drawer.remove();
          showMessage("Backup restored");
        } catch (_) {
          label.textContent = "Invalid backup. Progress has not changed.";
        }
      };
      actions.appendChild(apply);
    }
    drawer.append(label, input, actions);
    panel.appendChild(drawer);
    input.focus();
    if (!restoreMode) input.select();
  }

  function importBackup() { showBackup("", true); }
