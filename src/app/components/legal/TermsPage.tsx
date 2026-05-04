import { ArrowLeft, Shield } from 'lucide-react';

export function TermsPage() {
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
                        <h2 className="text-white text-base font-semibold">Terms &amp; Conditions</h2>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-2xl mx-auto px-4 py-8 space-y-8 pb-16">
                {/* Intro */}
                <div className="bg-[#16213e] rounded-2xl p-5 border border-white/5">
                    <p className="text-gray-400 text-sm leading-relaxed">
                        Last updated: March 2026. By using Keeguard, you agree to these Terms and Conditions.
                        Keeguard is an independent software project operated by its developer. If you do not agree, please do not use the app.
                    </p>
                </div>

                <Section title="Eligibility">
                    <p>You must be 18 years of age or older to use Keeguard. By accessing the app, you represent that you meet this requirement.</p>
                </Section>

                <Section title="License to Use">
                    <p>Keeguard is provided under a limited, personal, non-exclusive, non-transferable license. You may use the app for your private, personal use only. All rights in the app's code, content, and design remain the property of the developer.</p>
                </Section>

                <Section title="Your Data &amp; Your Vault">
                    <ul>
                        <li>You retain full ownership of everything you store in Keeguard.</li>
                        <li>The developer does <strong className="text-white">not</strong> have access to your Master Password or vault contents.</li>
                        <li>We will never ask for your Master Password.</li>
                        <li>If you forget your Master Password or PIN, we <strong className="text-white">cannot</strong> recover your data. It is your responsibility to keep these secrets safe.</li>
                    </ul>
                </Section>

                <Section title="Usage Restrictions">
                    <p>You agree not to use Keeguard for any unlawful or abusive purposes, including:</p>
                    <ul>
                        <li>Distributing viruses or malware</li>
                        <li>Reverse-engineering the application</li>
                        <li>Infringing others' intellectual property rights</li>
                        <li>Sharing your account with others</li>
                    </ul>
                    <p className="mt-2">Any violation may result in termination of your access.</p>
                </Section>

                <Section title="Modifications &amp; Termination">
                    <p>We may update, modify, suspend, or discontinue Keeguard (or any feature) at any time without notice. We may also change these Terms from time to time; the latest version will always be posted in the app. Continued use after changes implies acceptance of the new terms.</p>
                </Section>

                <Section title="No Warranty">
                    <p>Keeguard is provided <strong className="text-white">"as is"</strong>, without any express or implied warranty. We do not guarantee that the app will be error-free or uninterrupted. To the fullest extent allowed by law, the developer and contributors disclaim all warranties, including merchantability, fitness for a particular purpose, and non-infringement.</p>
                </Section>

                <Section title="Limitation of Liability">
                    <p>You use Keeguard at your own risk. The developer will not be liable for any damages, losses of data, or other harm arising from your use of the app — including any loss of content due to forgotten passwords, device failure, or any other cause — even if we have been advised of the possibility of such damage.</p>
                </Section>

                <Section title="Contact">
                    <p>For questions about these Terms, contact us at{' '}
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
