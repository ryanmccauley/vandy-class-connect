import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRouter } from 'next/navigation';
import { AuthProvider } from "../../src/app/lib/contexts";
import Login from "../../src/app/login/page";
import { signIn } from '../../src/app/server';

jest.mock('../../src/app/server', () => ({
    signIn: jest.fn(),
}));

jest.mock('../../src/app/lib/functions', () => ({
    getUserCookies: jest.fn().mockResolvedValue(null),
}));

jest.mock('next/navigation', () => ({
    useRouter: jest.fn(),
}));

const renderWithAuthProvider = (ui, options = {}) => {
    return render(<AuthProvider>{ui}</AuthProvider>, options);
};

describe("Login page", () => {
    const mockPush = jest.fn();
    beforeEach(() => {
        // Mock `signIn` function
        (signIn as jest.Mock).mockImplementation((email: string, password: string) => {
            if (email === 'test@vanderbilt.edu' && password === 'Testpassword123!') {
                return Promise.resolve({
                    id: 'test-user',
                    email: 'test-user@vanderbilt.edu',
                });
            } else {
                return Promise.reject(new Error('Invalid credentials'));
            }
        });

        // Mock `useRouter` return value with `push` function
        (useRouter as jest.Mock).mockReturnValue({
            push: mockPush,
        });
    });

    it("should call loginUser and navigate to '/home' on successful login", async () => {
        await act(async () => {
            renderWithAuthProvider(<Login />);
        });

        // Enter valid credentials
        fireEvent.change(screen.getByPlaceholderText("Vanderbilt Email"), { target: { value: "test@vanderbilt.edu" } });
        fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "Testpassword123!" } });

        // Click the login button
        fireEvent.click(screen.getByRole('button', { name: /login/i }));

        // Verify loginUser is called and router.push is triggered
        await waitFor(() => {
            expect(signIn).toHaveBeenCalledWith("test@vanderbilt.edu", "Testpassword123!");
            expect(mockPush).toHaveBeenCalledWith('/home');
        });
    });
});
