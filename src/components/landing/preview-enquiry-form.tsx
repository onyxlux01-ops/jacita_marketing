"use client";
import { useState, useSyncExternalStore, type FormEvent } from "react";
const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function PreviewEnquiryForm() {
  const hydrated = useSyncExternalStore(subscribe, clientReady, serverReady);
  const [message, setMessage] = useState("");
  function previewEnquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Preview only. No enquiry was sent or stored.");
  }
  return (
    <form className="contact-form" id="demoForm" onSubmit={previewEnquiry}>
      <div className="field">
        <label htmlFor="name">Your name</label>
        <input id="name" name="name" placeholder="Your name" required />
      </div>
      <div className="field">
        <label htmlFor="business">Business name</label>
        <input
          id="business"
          name="business"
          placeholder="Your business"
          required
        />
      </div>
      <div className="field full">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="you@business.com"
          required
        />
      </div>
      <div className="field full">
        <label htmlFor="help">What would you like to grow?</label>
        <textarea
          id="help"
          name="help"
          placeholder="Tell us about your goals"
          required
        ></textarea>
      </div>
      <button className="pill mint" type="submit" disabled={!hydrated}>
        Preview enquiry flow <span aria-hidden="true">↗</span>
      </button>
      <div className="form-note">
        This is a design preview. The form does not send or store information.
      </div>
      <noscript>
        <p>Enable JavaScript to try the preview enquiry flow.</p>
      </noscript>
      <p className="form-msg" id="formMessage" role="status">
        {message}
      </p>
    </form>
  );
}
