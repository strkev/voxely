#!/bin/bash

# ==========================================
# IT Security Pre-Publish Check Script
# ==========================================
# Run this script before you publish or deploy
# It checks for common vulnerabilities, leaked
# secrets, and type/lint errors.

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Starting IT Security & Quality Audit ===${NC}\n"

# 1. Check for basic tools
if ! command -v npm &> /dev/null; then
    echo -e "${RED}[ERROR] npm is not installed. Please install Node.js/npm.${NC}"
    exit 1
fi

echo -e "${YELLOW}[1/6] Checking Frontend Dependencies for Vulnerabilities (npm audit)...${NC}"
cd frontend || { echo -e "${RED}Frontend folder not found.${NC}"; exit 1; }
if npm audit --audit-level=high; then
    echo -e "${GREEN}✓ Frontend dependencies appear safe (No HIGH/CRITICAL vulnerabilities).${NC}"
else
    echo -e "${RED}⚠ High or Critical vulnerabilities found in frontend dependencies!${NC}"
fi
cd ..
echo ""

echo -e "${YELLOW}[2/6] Checking Backend Dependencies for Vulnerabilities (npm audit)...${NC}"
cd backend || { echo -e "${RED}Backend folder not found.${NC}"; exit 1; }
if npm audit --audit-level=high; then
    echo -e "${GREEN}✓ Backend dependencies appear safe (No HIGH/CRITICAL vulnerabilities).${NC}"
else
    echo -e "${RED}⚠ High or Critical vulnerabilities found in backend dependencies!${NC}"
fi
cd ..
echo ""

echo -e "${YELLOW}[3/6] Running Frontend Linting (Code Quality & Security Rules)...${NC}"
cd frontend || exit 1
if npm run lint; then
    echo -e "${GREEN}✓ Frontend linting passed.${NC}"
else
    echo -e "${RED}⚠ Linter found issues in the frontend code.${NC}"
fi
cd ..
echo ""

echo -e "${YELLOW}[4/6] Checking Backend TypeScript strictness (Type checking)...${NC}"
cd backend || exit 1
if npx tsc --noEmit; then
    echo -e "${GREEN}✓ Backend TypeScript types are valid.${NC}"
else
    echo -e "${RED}⚠ TypeScript errors found in the backend.${NC}"
fi
cd ..
echo ""

echo -e "${YELLOW}[5/6] Scanning for Accidental Secret Leaks (Hardcoded secrets)...${NC}"
LEAKS=$(grep -rE "(API_KEY|SECRET_|PASSWORD|TOKEN|BEGIN RSA|AWS_ACCESS_KEY)[[:blank:]]*[:=][[:blank:]]*[\"'][A-Za-z0-9_=-]{10,}[\"']" \
    --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next --exclude-dir=dist \
    --exclude=package-lock.json --exclude=security-test.sh --exclude=.env --exclude=README.md . || true)
ENV_TRACKED=$(git ls-files | grep -E "\.env$" || true)

if [ -n "$LEAKS" ]; then
    echo -e "${RED}⚠ POTENTIAL SECRETS HARDCODED IN CODEBASE!${NC}"
else
    echo -e "${GREEN}✓ No obvious hardcoded secrets detected in source files.${NC}"
fi

if [ -n "$ENV_TRACKED" ]; then
    echo -e "${RED}⚠ POTENTIAL SECRETS LEAKED: .env file tracked in Git!${NC}"
else
    echo -e "${GREEN}✓ No .env files are being tracked by Git.${NC}"
fi
echo ""

echo -e "${YELLOW}[6/6] Running All Unit & Integration Tests (Vitest)...${NC}"
echo -e "${BLUE}Running Frontend Tests...${NC}"
cd frontend && npx vitest run
echo -e "\n${BLUE}Running Backend Tests...${NC}"
cd ../backend && npx vitest run
cd ..
echo ""

echo -e "${BLUE}=== Audit Completed ===${NC}"
echo -e "Recommendation before publish:"
echo -e "1. Run '${GREEN}npm audit fix${NC}' if you had high vulnerabilities."
echo -e "2. Check the code for 'TODO' or 'FIXME' statements regarding security."
echo -e "3. Make sure 'bcrypt' and 'jsonwebtoken' usage is up-to-date in your backend auth."
