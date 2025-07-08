import requests

# The URL of your FastAPI endpoint
url = "http://localhost:8000/evaluateLatex"

# The LaTeX expression you want to evaluate
latex_expression = r"\sum_{k=0}^{10} k+1"

# Prepare the request payload
payload = {
    "latexExpression": latex_expression
}

# Send the POST request
response = requests.post(url, json=payload)

# Print the response
print("Status code:", response.status_code)
print("Response JSON:", response.json())