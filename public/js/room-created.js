const params = new URLSearchParams(window.location.search);
const roomCode = params.get('code') || sessionStorage.getItem('roomCode');
const inviteLink = sessionStorage.getItem('inviteLink') || `${window.location.origin}/join.html?code=${roomCode}`;

document.getElementById('roomCodeDisplay').textContent = roomCode || '------';
document.getElementById('inviteLinkInput').value = inviteLink;

document.getElementById('copyBtn').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(inviteLink);
    const btn = document.getElementById('copyBtn');
    const original = btn.textContent;
    btn.textContent = '✅ Copied!';
    setTimeout(() => (btn.textContent = original), 1500);
  } catch (err) {
    document.getElementById('inviteLinkInput').select();
    document.execCommand('copy');
  }
});

document.getElementById('shareBtn').addEventListener('click', async () => {
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Join my IPL Auction',
        text: `Join my IPL Auction room! Room code: ${roomCode}`,
        url: inviteLink
      });
    } catch (err) {
      // user cancelled share - no-op
    }
  } else {
    await navigator.clipboard.writeText(inviteLink);
    alert('Link copied to clipboard (share not supported on this browser).');
  }
});

document.getElementById('enterBtn').addEventListener('click', () => {
  window.location.href = '/waiting.html';
});
