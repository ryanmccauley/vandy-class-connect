import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import SavedCourses from '../src/app/savedCourses/page';
import userEvent from '@testing-library/user-event';
import { AuthContext } from "../src/app/lib/contexts";
import { getUserCookies } from '../src/app/lib/functions';
import pb from '../lib/pocketbaseClient';

//Mock dependencies
jest.mock('next/navigation', () => ({
    useRouter: jest.fn(),
    usePathname: jest.fn(() => '/savedCourses'),
}));
  
jest.mock('../src/app/lib/functions', () => ({
    getUserCookies: jest.fn(),
}));
  
jest.mock('../src/app/lib/pocketbaseClient', () => ({
    collection: jest.fn().mockImplementation((collectionName) => {
        if (collectionName === 'users') {
            return {
              getOne: jest.fn().mockResolvedValue({
                id: "user123",
                savedCourses: ["1", "2"],  // Mocked saved course IDs
              }),
            };
          }
          if (collectionName === 'courses') {
            return {
              getOne: jest.fn().mockImplementation((courseId) => {
                const courses = {
                  "1": { id: "1", name: "Program Design and Data Structures", code: "CS 2201", averageRating: 4.5 },
                  "2": { id: "2", name: "Methods of Linear Algebra", code: "MATH 2410", averageRating: 4.0 },
                };
                return Promise.resolve(courses[courseId]);
              }),
            };
          }
        return { getOne: jest.fn() };  // Default mock for any other collection
    }),
}));
const getOneMock = jest.fn();
const updateMock = jest.fn();

jest.mock('../src/app/server', () => ({
    getSavedCourses: jest.fn().mockResolvedValue([
        {
            id: "1",
            name: "Program Design and Data Structures",
            code: "CS 2201",
            averageRating: 4.5,
        },
        {
            id: "2",
            name: "Methods of Linear Algebra",
            code: "MATH 2410",
            averageRating: 4.0,
        },
    ]),
}));

describe("SavedCourses page", () => {
    const mockPush = jest.fn();

    const mockAuthContextValue = {
        userData: {
            id: "123",
            firstName: "John",
            lastName: "Smith",
            username: "johnsmith",
            email: "john.smith@example.com",
            graduationYear: "2024",
            profilePic: "profilePicUrl",
        },
        getUser: jest.fn(),
        logoutUser: jest.fn(),
        loginUser: jest.fn(),
    };

    beforeAll(() => {
        jest.clearAllMocks();
    });

    beforeEach(() => {
        // Mock useRouter
        (useRouter as jest.Mock).mockReturnValue({
            push: mockPush,
        });

        // Mock getUserCookies
        (getUserCookies as jest.Mock).mockResolvedValue({
            id: "123",
            firstName: "John",
            lastName: "Smith",
        });

        // Mock getOne (getting saved courses for the user)
        getOneMock.mockResolvedValue({
            savedCourses: ["1"], // Simulate that course with ID 1 is saved
        });

        // Mock update function to simulate saving/removing courses
        updateMock.mockResolvedValue({});
    });

    afterAll(() => {
        jest.clearAllMocks();
    });

    it("should render the saved courses list correctly", async () => {

        const { getByText } = render(<SavedCourses />);
        expect(getByText('Loading...')).toBeInTheDocument();
        await waitFor(() => expect(screen.getByText("CS 2201")).toBeInTheDocument());
        await waitFor(() => {
            expect(getByText('CS 2201')).toBeInTheDocument();
            expect(getByText('MATH 2410')).toBeInTheDocument();
          });
    });

    it("should display loading state when courses are being fetched", () => {
        render(
            <AuthContext.Provider value={mockAuthContextValue}>
                <SavedCourses />
            </AuthContext.Provider>
        );
        expect(screen.getByText("Loading...")).toBeInTheDocument();
    });

    it("should toggle between edit and save mode when the edit button is clicked", async () => {
        await act(async () => {
            render(
                <AuthContext.Provider value={mockAuthContextValue}>
                    <SavedCourses />
                </AuthContext.Provider>
            );
        });

        const editButton = screen.getByRole("button", { name: /edit/i });
        expect(editButton).toBeInTheDocument();

        // Test initial state
        expect(editButton).toHaveTextContent("Edit");

        // Click to enable edit mode
        fireEvent.click(editButton);
        expect(editButton).toHaveTextContent("Save Changes");

        // Click to save changes
        fireEvent.click(editButton);
        expect(editButton).toHaveTextContent("Edit");
    });

    it("should open confirmation dialog when removing a course", async () => {
        await act(async () => {
            render(
                <AuthContext.Provider value={mockAuthContextValue}>
                    <SavedCourses />
                </AuthContext.Provider>
            );
        });

        // Simulate the user entering edit mode
        const editButton = screen.getByRole("button", { name: /edit/i });
        fireEvent.click(editButton);  // Click to enter edit mode

        const removeButton = screen.getAllByTestId('unsave-button');  // Assuming there are multiple courses
        fireEvent.click(removeButton[0]);

        expect(screen.getByText(/are you sure you want to remove this course/i)).toBeInTheDocument();

        const closeButton = screen.getByRole('button', { name: /close/i });
        fireEvent.click(closeButton);  // Cancel the action

        await waitFor (() => expect(screen.queryByText(/are you sure you want to remove this course/i)).not.toBeInTheDocument());
    });

    it("should navigate to course page when 'View Course' is clicked", async () => {
        // Mock the course data
        const courses = [
        {
          id: "1",
          name: "Program Design and Data Structures",
          code: "CS 2201",
          averageRating: 4.5,
        },
        {
          id: "2",
          name: "Methods of Linear Algebra",
          code: "MATH 2410",
          averageRating: 4.0,
        },
      ];
  
      // Render the SavedCourses component with mocked courses
      await act(async () => {
        render(
          <AuthContext.Provider value={mockAuthContextValue}>
            <SavedCourses />
          </AuthContext.Provider>
        );
      });
  
      // Simulate clicking the "View Course" button for the first course
      const viewCourseButton = screen.getAllByText(/View Course/i);
      fireEvent.click(viewCourseButton[0]);
  
      // Assert that the router.push method was called with the correct URL
      expect(mockPush).toHaveBeenCalledWith("/course?id=1");
    });
    

    it("should display loading state initially", () => {
        render(
            <AuthContext.Provider value={mockAuthContextValue}>
                <SavedCourses />
            </AuthContext.Provider>
        );
        expect(screen.getByText("Loading...")).toBeInTheDocument();
    });

    // it("should display an error message if fetching courses fails", async () => {
    //     jest.spyOn(console, 'error').mockImplementation(() => {}); // Suppress console error
    //     pb.collection.mockImplementationOnce(() => ({
    //       getOne: jest.fn().mockRejectedValue(new Error("Failed to fetch courses")),
    //     }));
      
    //     render(
    //       <AuthContext.Provider value={mockAuthContextValue}>
    //         <SavedCourses />
    //       </AuthContext.Provider>
    //     );
      
    //     await waitFor(() => expect(screen.getByText(/failed to fetch courses/i)).toBeInTheDocument());
    //     console.error.mockRestore();
    //   });

});