import { Check, X } from 'lucide-react';
import React from 'react';

export interface PasswordCheck {
    label: string;
    passed: boolean;
}

export function validatePassword(password: string): PasswordCheck[] {
    return [
        { label: 'At least 8 characters', passed: password.length >= 8 },
        { label: 'One uppercase letter (A-Z)', passed: /[A-Z]/.test(password) },
        { label: 'One lowercase letter (a-z)', passed: /[a-z]/.test(password) },
        { label: 'One number (0-9)', passed: /[0-9]/.test(password) },
        { label: 'One special character (!@#$...)', passed: /[!@#$%^&*()_+\-=\[\]{}|;':",./<>?\\`~]/.test(password) },
    ];
}

export function isPasswordStrong(password: string): boolean {
    return validatePassword(password).every((c) => c.passed);
}

export function PasswordStrengthIndicator({ password }: { password: string }) {
    const checks = validatePassword(password);
    if (!password) return null;

    return (
        <div className= "space-y-1.5 pt-1 mb-3" >
        {
            checks.map((check) => (
                <div key= { check.label } className = "flex items-center gap-2 text-xs" >
                {
                    check.passed ? (
                        <Check className= "w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                            <X className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    )
}
<span className={ check.passed ? 'text-emerald-400' : 'text-red-400' }>
    { check.label }
    </span>
    </div>
            ))}
</div>
    );
}
