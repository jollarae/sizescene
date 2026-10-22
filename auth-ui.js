const emailForm = document.getElementById('email-form');
const codeForm = document.getElementById('code-form');
const signedIn = document.getElementById('signed-in');
const accountStatus = document.getElementById('account-status');
const emailInput = document.getElementById('account-email');
const codeInput = document.getElementById('account-code');
emailInput.value = SizeSceneAIConfig.ownerEmail;

async function renderAccount() {
  const session = await SizeSceneAuth.getSession();
  const active = !!session?.access_token;
  emailForm.hidden = active;
  codeForm.hidden = active;
  signedIn.hidden = !active;
  document.getElementById('signed-in-email').textContent = active ? `Signed in as ${session.email}` : '';
}

emailForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = emailForm.querySelector('button');
  button.disabled = true;
  accountStatus.textContent = 'Sending sign-in link…';
  try {
    await SizeSceneAuth.sendCode(emailInput.value);
    codeForm.dataset.sent = 'true';
    codeForm.hidden = false;
    accountStatus.textContent = 'Check your email and paste the Sign in button’s link address below. Already opened it? Paste the full localhost address from that tab.';
    codeInput.focus();
  } catch {
    accountStatus.textContent = 'Could not send a sign-in link. Check the email address and try again.';
  } finally { button.disabled = false; }
});

codeForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = codeForm.querySelector('button');
  button.disabled = true;
  accountStatus.textContent = 'Signing in…';
  try {
    await SizeSceneAuth.verifyLink(codeInput.value);
    accountStatus.textContent = 'Signed in. Open a jeans product page and scan it.';
    codeInput.value = '';
    await renderAccount();
  } catch {
    accountStatus.textContent = 'That address did not work. Check that you pasted the full address, or request a new sign-in link.';
  } finally { button.disabled = false; }
});

document.getElementById('sign-out').addEventListener('click', async () => {
  await SizeSceneAuth.signOut();
  codeForm.dataset.sent = 'false';
  accountStatus.textContent = 'Signed out.';
  await renderAccount();
});

renderAccount().catch(() => { accountStatus.textContent = 'Could not load sign-in status.'; });
