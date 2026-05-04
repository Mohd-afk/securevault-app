import { ArrowLeft, Shield } from 'lucide-react';

export function PrivacyPage() {
    return (
        <div className="min-h-screen bg-[#1a1a2e] text-white">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-[#1a1a2e]/95 backdrop-blur-sm border-b border-white/5">
                <div className="flex items-center gap-3 px-4 py-3 max-w-2xl mx-auto">
                    <button
                        onClick={() => window.history.back()}
                        className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-cyan-400" />
                        <h2 className="text-white text-base font-semibold">Privacy Policy</h2>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-2xl mx-auto px-4 py-8 space-y-8 pb-16">
                {/* Zero-knowledge callout */}
                <div className="bg-gradient-to-r from-cyan-500/10 to-blue-600/10 border border-cyan-500/20 rounded-2xl p-5">
                    <p className="text-cyan-300 text-sm font-medium mb-1">Zero-Knowledge Architecture</p>
                    <p className="text-gray-400 text-sm leading-relaxed">
                        Keeguard is a zero-knowledge password manager. All sensitive data you store is end-to-end encrypted on your device. We <strong className="text-white">cannot</strong> read your vault — ever.
                    </p>
                </div>

                <Section title="Data You Provide">
                    <ul>
                        <li>Your <strong className="text-white">email address</strong> (to create an account and log in)</li>
                        <li>Basic Google profile info (name and email) if you sign in with Google</li>
                        <li>Any information you voluntarily provide in support requests</li>
                    </ul>
                    <p className="mt-2">We do <strong className="text-white">not</strong> collect or store your Master Password or the contents of your vault.</p>
                </Section>

                <Section title="Vault Data (Encrypted)">
                    <p>Everything you store in Keeguard (passwords, secure notes, etc.) is encrypted with <strong className="text-white">AES-256-GCM</strong> on your device using your Master Password. The encrypted data may be synced through Firebase but is always encrypted under your control. <strong className="text-white">We cannot decrypt or see your vault data.</strong></p>
                </Section>

                <Section title="How We Use Your Data">
                    <ul>
                        <li>Enable login and authentication</li>
                        <li>Send password reset emails</li>
                        <li>Provide customer support if you contact us</li>
                    </ul>
                    <p className="mt-2">We do <strong className="text-white">not</strong> use your data for marketing, advertising, or sharing with third parties. We collect <strong className="text-white">zero personal analytics or tracking</strong>.</p>
                </Section>

                <Section title="Security Measures">
                    <ul>
                        <li>All communications are encrypted using TLS (HTTPS)</li>
                        <li>Vault data stored on our servers cannot be read without your Master Password</li>
                        <li>We encourage you to use a strong, unique Master Password</li>
                    </ul>
                </Section>

                <Section title="Data Retention">
                    <p>We retain your account information (email, user ID) only as long as needed to provide the service. You can request deletion of your account and personal information at any time by contacting us. Account deletion will remove any encrypted data stored on our servers.</p>
                </Section>

                <Section title="Your Rights">
                    <p>You have the right to access, correct, or delete your personal information we hold (e.g. your email). You may also export or delete your vault data at any time using the app's Export feature. If you are a resident of the EU or California, you may have additional rights under GDPR or CCPA.</p>
                </Section>

                <Section title="Third-Party Services">
                    <p>Keeguard uses <strong className="text-white">Firebase</strong> (operated by Google) for authentication and encrypted data sync. Your non-sensitive data (email, encrypted vault) is stored in Google's infrastructure under their Privacy Policy. We do not use any other third-party services that collect personal information.</p>
                </Section>

                <Section title="Cookies">
                    <p>The Keeguard app does not use tracking or marketing cookies. Only essential session cookies are used for keeping you logged in.</p>
                </Section>

                <Section title="Policy Updates">
                    <p>We may update this Privacy Policy as the app evolves. Changes will be posted in the app with a date. Continued use after changes implies acceptance.</p>
                </Section>

                <Section title="Contact">
                    <p>For privacy questions or to exercise your rights, contact us at{' '}
                        <a href="mailto:support@Keeguard.app" className="text-cyan-400 hover:underline">support@Keeguard.app</a>.
                    </p>
                </Section>
            </div>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <h3 className="text-white font-semibold text-sm uppercase tracking-wider mb-3 text-cyan-400/80">{title}</h3>
            <div className="bg-[#16213e] rounded-2xl p-5 border border-white/5 text-gray-400 text-sm leading-relaxed space-y-2 [&_ul]:list-disc [&_ul]:list-inside [&_ul]:space-y-1.5 [&_ul]:text-gray-400">
                {children}
            </div>
        </div>
    );
}
