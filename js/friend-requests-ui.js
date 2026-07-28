// Habit Tracker - Friend Requests screen UI
//
// Renders Incoming/Outgoing sections from FriendRequestService.listRequests().
// Accept/Decline/Cancel are optimistic: a responded-to card is removed from
// its list immediately on success rather than refetching the whole list.

(function () {
  const incomingList = document.getElementById("friendRequestsIncomingList");
  const outgoingList = document.getElementById("friendRequestsOutgoingList");
  const incomingEmpty = document.getElementById("friendRequestsIncomingEmpty");
  const outgoingEmpty = document.getElementById("friendRequestsOutgoingEmpty");

  if (!incomingList || typeof FriendRequestService === "undefined") return;

  function avatarNode(entry) {
    if (entry.avatar_url) {
      const img = document.createElement("img");
      img.className = "friend-request-avatar";
      img.src = entry.avatar_url;
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      return img;
    }
    const span = document.createElement("span");
    span.className = "friend-request-avatar friend-request-avatar-fallback";
    span.textContent = (entry.display_name || entry.username || "?")[0].toUpperCase();
    return span;
  }

  function setCardBusy(card, busy) {
    card.querySelectorAll("button").forEach((b) => (b.disabled = busy));
  }

  function removeCard(card, listEl, emptyEl) {
    card.remove();
    if (listEl.children.length === 0 && emptyEl) emptyEl.hidden = false;
  }

  async function handleRespond(entry, card, accept) {
    setCardBusy(card, true);
    const result = await FriendRequestService.respondToRequest(entry.request_id, null, accept);
    setCardBusy(card, false);
    if (result.status === "error") return;
    removeCard(card, incomingList, incomingEmpty);
  }

  async function handleCancel(entry, card) {
    setCardBusy(card, true);
    const result = await FriendRequestService.cancelRequest(entry.request_id, null);
    setCardBusy(card, false);
    if (result.status === "error") return;
    removeCard(card, outgoingList, outgoingEmpty);
  }

  function requestCard(entry, kind) {
    const card = document.createElement("div");
    card.className = "friend-request-card";

    card.appendChild(avatarNode(entry));

    const info = document.createElement("div");
    info.className = "friend-request-info";

    const nameEl = document.createElement("span");
    nameEl.className = "friend-request-name";
    nameEl.textContent = entry.display_name || entry.username;

    const metaEl = document.createElement("span");
    metaEl.className = "friend-request-meta";
    metaEl.textContent = `@${entry.username} · 🔥 ${entry.current_streak}`;

    info.append(nameEl, metaEl);

    const actions = document.createElement("div");
    actions.className = "friend-request-actions";

    if (kind === "incoming") {
      const acceptBtn = document.createElement("button");
      acceptBtn.type = "button";
      acceptBtn.className = "friend-request-btn friend-request-btn-accept";
      acceptBtn.textContent = "Accept";
      acceptBtn.addEventListener("click", () => handleRespond(entry, card, true));

      const declineBtn = document.createElement("button");
      declineBtn.type = "button";
      declineBtn.className = "friend-request-btn friend-request-btn-decline";
      declineBtn.textContent = "Decline";
      declineBtn.addEventListener("click", () => handleRespond(entry, card, false));

      actions.append(acceptBtn, declineBtn);
    } else {
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "friend-request-btn friend-request-btn-cancel";
      cancelBtn.textContent = "Cancel Request";
      cancelBtn.addEventListener("click", () => handleCancel(entry, card));
      actions.appendChild(cancelBtn);
    }

    card.append(info, actions);
    return card;
  }

  function renderList(listEl, emptyEl, entries, kind) {
    listEl.innerHTML = "";
    if (entries.length === 0) {
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    entries.forEach((entry, index) => {
      const card = requestCard(entry, kind);
      card.style.animationDelay = `${Math.min(index, 8) * 0.04}s`;
      listEl.appendChild(card);
    });
  }

  async function render() {
    const { incoming, outgoing } = await FriendRequestService.listRequests();
    renderList(incomingList, incomingEmpty, incoming, "incoming");
    renderList(outgoingList, outgoingEmpty, outgoing, "outgoing");
  }

  document.addEventListener("screen:shown", (e) => {
    if (e.detail.screen === "friend-requests") render();
  });
})();
