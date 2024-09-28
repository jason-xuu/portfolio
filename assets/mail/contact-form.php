<?php
// Display errors for debugging
ini_set('display_errors', 1);
error_reporting(E_ALL);

// Check if the form has been submitted
if (isset($_POST['submit'])) {
    // Sanitize and validate input data
    $conName = filter_input(INPUT_POST, 'conName', FILTER_SANITIZE_STRING);
    $conLName = filter_input(INPUT_POST, 'conLName', FILTER_SANITIZE_STRING);
    $conEmail = filter_input(INPUT_POST, 'conEmail', FILTER_SANITIZE_EMAIL);
    $conPhone = filter_input(INPUT_POST, 'conPhone', FILTER_SANITIZE_STRING);
    $conService = filter_input(INPUT_POST, 'conService', FILTER_SANITIZE_STRING);
    $conMessage = filter_input(INPUT_POST, 'conMessage', FILTER_SANITIZE_STRING);

    // Basic validation
    $errors = [];
    if (empty($conName) || empty($conLName) || empty($conEmail) || empty($conMessage)) {
        $errors[] = "Please fill in all required fields.";
    }

    if (!filter_var($conEmail, FILTER_VALIDATE_EMAIL)) {
        $errors[] = "Invalid email format.";
    }

    // If there are errors, display them
    if (!empty($errors)) {
        foreach ($errors as $error) {
            echo "<p style='color:red;'>$error</p>";
        }
    } else {
        // Set the recipient email address.
        $recipient = "jasonxu.coding@gmail.com";

        // Set the email subject.
        $sender = $conName . " { " . $conEmail . " }";
        $head = "You have a new message from your Personal Website";

        // Build the email content.
        $form_content = "$head\n\n";
        $form_content .= "Full Name: $conName $conLName\n";
        $form_content .= "Email: $conEmail\n";
        $form_content .= "Phone: $conPhone\n";
        $form_content .= "Service: $conService\n";
        $form_content .= "Message: \n$conMessage\n";

        // Build the email headers.
        $headers = "From: $conName <$conEmail>\r\n" .
                   "Reply-To: $conEmail\r\n" .
                   'X-Mailer: PHP/' . phpversion();

        // Send the email
        if (mail($recipient, $sender, $form_content, $headers)) {
            echo "<p style='color:green;'>Mail Sent. Thank you, $conName, we will contact you shortly.</p>";
            // Optionally redirect to a thank-you page
            // header('Location: thank_you.php'); // Uncomment to redirect
            // exit; // Uncomment if redirecting
        } else {
            echo "<p style='color:red;'>There was a problem sending your message. Please try again later.</p>";
        }
    }
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Contact Form</title>
</head>
<body>

<form action="" method="post">
    <label for="conName">First Name:</label>
    <input type="text" name="conName" required><br>
    
    <label for="conLName">Last Name:</label>
    <input type="text" name="conLName" required><br>
    
    <label for="conEmail">Email:</label>
    <input type="email" name="conEmail" required><br>
    
    <label for="conPhone">Phone:</label>
    <input type="text" name="conPhone"><br>
    
    <label for="conService">Service:</label>
    <input type="text" name="conService"><br>
    
    <label for="conMessage">Message:</label><br>
    <textarea rows="5" name="conMessage" cols="30" required></textarea><br>
    
    <input type="submit" name="submit" value="Submit">
</form>

</body>
</html>
