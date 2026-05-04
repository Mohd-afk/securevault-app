import { ArrowLeft, Shield } from 'lucide-react';

export function LicensePage() {
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
                        <h2 className="text-white text-base font-semibold">License Agreement</h2>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-2xl mx-auto px-4 py-8 space-y-8 pb-16">
                {/* Intro */}
                <div className="bg-[#16213e] rounded-2xl p-5 border border-white/5">
                    <p className="text-gray-400 text-sm leading-relaxed">
                        Keeguard's code and content are protected by copyright.
                        The developer retains all rights not expressly granted to you under this License Agreement.
                    </p>
                </div>

                <Section title="Personal License Grant">
                    <p>You are granted a personal, non-exclusive, non-transferable, revocable license to use Keeguard for your private, personal use only. This license does <strong className="text-white">not</strong> allow you to:</p>
                    <ul>
                        <li>Copy, modify, or distribute the application</li>
                        <li>Reverse-engineer or decompile the source code</li>
                        <li>Use the app for commercial purposes</li>
                        <li>Sub-license or sell access to the app</li>
                    </ul>
                </Section>

                <Section title="Open-Source Components">
                    <p>Keeguard is built upon several open-source libraries, each governed by their respective licenses (MIT, Apache 2.0, etc.). These components include but are not limited to:</p>
                    <ul>
                        <li>React (MIT License)</li>
                        <li>Firebase SDK (Apache 2.0)</li>
                        <li>Tailwind CSS (MIT License)</li>
                        <li>Lucide Icons (ISC License)</li>
                    </ul>
                    <p className="mt-2">The use of these components does not grant you any rights to the Keeguard application itself beyond what is described in this agreement.</p>
                </Section>

                <Section title="MIT License (Reference)">
                    <p className="text-xs font-mono bg-[#1a1a2e] p-4 rounded-xl border border-white/5 leading-relaxed">
                        Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
                        <br /><br />
                        The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
                        <br /><br />
                        THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY.
                    </p>
                    <p className="text-xs text-gray-500 mt-2">Note: The above MIT License text applies to open-source components used within Keeguard, not to the application as a whole.</p>
                </Section>

                <Section title="No Warranty">
                    <p>Keeguard is provided <strong className="text-white">"as is"</strong>, without warranty of any kind — express or implied. In no event shall the developer or contributors be liable for any claim, damages, or other liability arising from, out of, or in connection with the software or the use of it.</p>
                </Section>

                <Section title="Termination">
                    <p>This license is automatically revoked if you violate any of its terms. Upon termination, you must stop using the application. The developer reserves the right to suspend or terminate your access at any time.</p>
                </Section>

                <Section title="Contact">
                    <p>For licensing inquiries, contact us at{' '}
                        <a href="mailto:support@Keeguard.app" className="text-cyan-400 hover:underline">support@Keeguard.app</a>.
                    </p>
                </Section>

                {/* Copyright footer */}
                <div className="text-center pt-4">
                    <p className="text-gray-600 text-xs">© {new Date().getFullYear()} Keeguard. All rights reserved.</p>
                    <p className="text-gray-600 text-xs mt-1">Keeguard is an independent software project operated by its developer.</p>
                </div>
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
