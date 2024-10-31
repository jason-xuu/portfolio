<?php
// Prevent direct access to this file
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('HTTP/1.1 403 Forbidden');
    exit('Direct access forbidden');
}

// Set header to return JSON response
header('Content-Type: application/json');

// Function to send JSON response
function sendResponse($success, $message) {
    echo json_encode(['success' => $success, 'message' => $message]);
    exit;
}

// Check if the form has been submitted
if (isset($_POST['submit'])) {
    try {
        // Sanitize and validate input data
        $conName = filter_var($_POST['conName'], FILTER_SANITIZE_STRING);
        $conLName = filter_var($_POST['conLName'], FILTER_SANITIZE_STRING);
        $conEmail = filter_var($_POST['conEmail'], FILTER_SANITIZE_EMAIL);
        $conPhone = filter_var($_POST['conPhone'], FILTER_SANITIZE_STRING);
        $conService = filter_var($_POST['conService'], FILTER_SANITIZE_STRING);
        $conMessage = filter_var($_POST['conMessage'], FILTER_SANITIZE_STRING);

        // Validation
        if (empty($conName) || empty($conLName) || empty($conEmail) || empty($conMessage)) {
            sendResponse(false, "Please fill in all required fields.");
        }

        if (!filter_var($conEmail, FILTER_VALIDATE_EMAIL)) {
            sendResponse(false, "Invalid email format.");
        }

        // Set up email parameters
        $to = "jasonxu.coding@gmail.com";
        $subject = "New Contact Form Submission from $conName $conLName";
        
        // Build email message
        $message = "New contact form submission:\n\n";
        $message .= "Name: $conName $conLName\n";
        $message .= "Email: $conEmail\n";
        $message .= "Phone: $conPhone\n";
        $message .= "Service: $conService\n";
        $message .= "Message:\n$conMessage\n";

        // Email headers
        $headers = array(
            'From' => $conEmail,
            'Reply-To' => $conEmail,
            'X-Mailer' => 'PHP/' . phpversion(),
            'Content-Type' => 'text/plain; charset=UTF-8'
        );

        // Send email
        if (mail($to, $subject, $message, implode("\r\n", $headers))) {
            sendResponse(true, "Thank you for your message. We'll get back to you soon!");
        } else {
            sendResponse(false, "Failed to send email. Please try again later.");
        }
    } catch (Exception $e) {
        error_log("Contact form error: " . $e->getMessage());
        sendResponse(false, "An unexpected error occurred. Please try again later.");
    }
} else {
    sendResponse(false, "Invalid form submission.");
}
?>