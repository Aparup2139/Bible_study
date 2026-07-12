/**
 * In-app legal documents shown from Settings. Starter texts — review and adapt
 * before a public store release (they are written for BibleWay's current
 * feature set: live streaming, VOD uploads, podcasts, and the AI Bible agent).
 */

export type LegalDocKey = 'terms' | 'privacy' | 'complaints' | 'creatorConsent';

export interface LegalDoc {
  title: string;
  updated: string;
  body: string;
}

export const LEGAL_DOCS: Record<LegalDocKey, LegalDoc> = {
  terms: {
    title: 'Terms & Conditions',
    updated: 'July 2026',
    body: `Welcome to BibleWay. By creating an account or using the app you agree to these terms.

1. The Service
BibleWay is a Christian community platform for live streaming, sharing video teachings, podcasts, and Bible study. We may add, change, or remove features at any time.

2. Your Account
You must provide accurate information and keep your password secure. You are responsible for all activity under your account. You must be at least 13 years old to use BibleWay.

3. Your Content
You keep ownership of everything you stream, upload, or post. By publishing content on BibleWay you grant us a worldwide, non-exclusive licence to host, transmit, and display it within the app so other users can watch it. You can delete your content, or your whole account, at any time.

4. Acceptable Use
Do not use BibleWay to post content that is unlawful, hateful, harassing, sexually explicit, violent, or that infringes someone else's rights (including copyright in worship music, translations, and teaching materials). Live streams are monitored through community reports and may be ended or removed if they break these rules.

5. Termination
We may suspend or close accounts that repeatedly or seriously violate these terms. You may stop using the service and delete your account at any time from Settings.

6. Disclaimers
BibleWay is provided "as is" without warranties. To the maximum extent permitted by law, we are not liable for indirect or consequential damages arising from use of the app.

7. Changes
We may update these terms; continued use after an update means you accept the new terms. We will surface material changes in the app.`,
  },

  privacy: {
    title: 'Privacy Policy',
    updated: 'July 2026',
    body: `This policy explains what BibleWay collects and how it is used.

1. What we collect
- Account data: email address, username, display name, and password (stored as a secure hash by our authentication provider, Supabase).
- Content you create: live streams, uploaded videos, podcast plays, questions asked to the Bible agent, and profile details.
- Usage data: basic technical logs (device type, app version, timestamps) needed to run and debug the service.

2. What we do NOT do
We do not sell your personal data. We do not show third-party advertising.

3. Service providers
BibleWay runs on trusted infrastructure providers that process data on our behalf: Supabase (accounts and database), Agora (live video transport), Cloudflare (video storage and delivery), and Render (application hosting). Live video is transmitted through these providers only to deliver the stream to viewers.

4. AI features
Questions you ask the Bible agent are sent to our AI provider to generate a response. Do not include sensitive personal information in your questions.

5. Retention & deletion
Your data is kept while your account is active. Deleting your account from Settings permanently removes your account, profile, and content from our systems.

6. Your rights
You may request a copy of your data, correction, or deletion at any time by contacting support.

7. Contact
For privacy questions, use Help & Support in Settings.`,
  },

  complaints: {
    title: 'Complaints & Content Removal Policy',
    updated: 'July 2026',
    body: `We want BibleWay to stay a safe, respectful community.

1. Reporting content
If you see content that is unlawful, infringing, abusive, or otherwise violates our Terms, contact us through Help & Support with a link or description of the content and the reason for your complaint.

2. What happens next
We review reports promptly. Content that violates our Terms is removed, and repeated or serious violations lead to account suspension or termination. Where the law requires, we will also notify the relevant authorities.

3. Copyright complaints
If you believe content on BibleWay infringes your copyright, send us: (a) identification of the work, (b) the location of the infringing material in the app, (c) your contact details, and (d) a statement that you believe in good faith the use is unauthorised. We will remove infringing material and, for repeat infringers, terminate accounts.

4. Appeals
If your content was removed and you believe this was a mistake, reply through Help & Support within 14 days and we will re-review it.`,
  },

  creatorConsent: {
    title: 'Creator Consent & Media Licensing',
    updated: 'July 2026',
    body: `This notice applies whenever you go live or upload video or audio to BibleWay.

1. Your consent
By starting a live stream or uploading media you confirm that you consent to BibleWay transmitting, hosting, and displaying that media to other users of the app.

2. People appearing in your media
You are responsible for obtaining consent from every identifiable person who appears in your streams or uploads. Do not stream people who have not agreed to appear.

3. Music and third-party material
Worship music, backing tracks, Bible translations, books, and other teaching materials may be protected by copyright. Only include material you own, have licensed, or that is in the public domain. You are solely responsible for the licences your content requires.

4. Licence you grant us
You keep all rights to your media. You grant BibleWay a non-exclusive, worldwide, royalty-free licence to store, transcode, transmit, and display your media within the app for as long as you keep it published. Deleting the media or your account ends this licence, except for the limited period needed to purge copies from our systems.

5. Recordings
Live streams are currently delivered in real time. If stream recording is introduced, you will be able to control whether your streams are recorded.`,
  },
};
