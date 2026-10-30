export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

export const faqItems: FaqItem[] = [
  {
    id: 'who-can-join',
    question: 'Who is eligible to join the CSI GCET Student Branch?',
    answer:
      'Any student currently enrolled in an undergraduate or postgraduate engineering programme at G H Patel College of Engineering & Technology (GCET) is eligible to register during an active membership drive.',
    category: 'Membership',
  },
  {
    id: 'how-to-verify',
    question: 'How is membership verified against the college records?',
    answer:
      'Registration uses roster-first identity verification. You will be prompted for your official enrollment number, which is matched in real-time against the branch’s annual verified roster for the current academic year.',
    category: 'Verification',
  },
  {
    id: 'id-card-and-qr',
    question: 'How does the digital member ID card and attendance QR pass work?',
    answer:
      'Authenticated members receive a cryptographic, Ed25519-signed digital ID card containing a rotating QR code. This code is scanned at workshop desks to securely record your attendance without manual sign-in sheets.',
    category: 'Credentials',
  },
  {
    id: 'certificates',
    question: 'When and how are participation certificates issued?',
    answer:
      'Certificates are issued only to verified participants who have an official attendance record recorded by the desk scanners. Digital certificates carry a tamper-evident public verification code and can be verified by third parties.',
    category: 'Certificates',
  },
  {
    id: 'password-reset',
    question: 'What should I do if I forget my password or credentials?',
    answer:
      'Use the self-service Password Recovery page. A secure single-use reset token will be issued. Resetting your credentials invalidates all existing active sessions to protect account integrity.',
    category: 'Security',
  },
];

