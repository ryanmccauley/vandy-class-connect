import { fireEvent, render, screen } from "@testing-library/react";
import Login from "../src/app/login/page";
import { signIn } from '../src/app/server'; // Import signIn for type inference

// Mock the 'signIn' function globally before all tests
jest.mock('../src/app/server', () => ({
  signIn: jest.fn(),
}));

describe("Login page", () => {
  beforeEach(() => {
    // Define the mock implementation for 'signIn'
    const mockSignIn = jest.fn().mockImplementation((formData) => {
      const email = formData.get('email');
      const password = formData.get('password');
    
      if (email === 'test@vanderbilt.edu' && password === 'Testpassword123!') {
        return Promise.resolve({
          record: {
            id: 'test-user',
            email: 'test-user@vanderbilt.edu',
          },
          token: 'test-token',
        });
      } else {
        return Promise.reject(new Error('Invalid credentials'));
      }
    });

    // Apply the mock implementation
    (signIn as jest.Mock).mockImplementation(mockSignIn);
  });

  it("should render the login form", () => {
    render(<Login />);
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
  });

  it("should show error message on failed login", async () => {
    render(<Login />);
    
    // Simulate user input
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "wrong@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "wrongpassword" } });
    
    // Simulate form submission
    fireEvent.click(screen.getByRole('button', { name: /login/i }));
    
    // Expect error message after failed login attempt
    expect(await screen.findByText("Login failed. Please check your credentials.")).toBeInTheDocument();
  });
});