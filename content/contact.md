---
title: "Contact"
description: "Get in touch with HamShackTech."
showDate: false
showPagination: false
---

Questions, ideas, or your own ham shack tech projects — drop a note below, or email [contact@hamshacktech.com](mailto:contact@hamshacktech.com) directly.

<form class="contact-form" action="https://formsubmit.co/contact@hamshacktech.com" method="POST">
<input type="hidden" name="_subject" value="New message from HamShackTech contact form" />
<input type="hidden" name="_template" value="table" />
<input type="hidden" name="_next" value="https://hamshacktech.com/contact/?sent=1" />
<input type="text" name="_honey" style="display:none" tabindex="-1" autocomplete="off" />

<label for="name">Name</label>
<input type="text" id="name" name="name" required />

<label for="email">Email</label>
<input type="email" id="email" name="email" required />

<label for="message">Message</label>
<textarea id="message" name="message" rows="6" required></textarea>

<button type="submit" class="button">Send Message</button>
</form>

<p class="form-note" id="sent-note">Thanks — your message is on its way. I'll get back to you soon.</p>

<script>
if (new URLSearchParams(window.location.search).get('sent') === '1') {
  document.getElementById('sent-note').classList.add('visible');
}
</script>
