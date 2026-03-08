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

echo -e "${YELLOW}[1/5] Checking Frontend Dependencies for Vulnerabilities (npm audit)...${NC}"
cd frontend || { echo -e "${RED}Frontend folder not found.${NC}"; exit 1; }
if npm audit --audit-level=high; then
    echo -e "${GREEN}✓ Frontend dependencies appear safe (No HIGH/CRITICAL vulnerabilities).${NC}"
else
    echo -e "${RED}⚠ High or Critical vulnerabilities found in frontend dependencies! Review the audit log above.${NC}"
fi
cd ..
echo ""

echo -e "${YELLOW}[2/5] Checking Backend Dependencies for Vulnerabilities (npm audit)...${NC}"
cd backend || { echo -e "${RED}Backend folder not found.${NC}"; exit 1; }
if npm audit --audit-level=high; then
    echo -e "${GREEN}✓ Backend dependencies appear safe (No HIGH/CRITICAL vulnerabilities).${NC}"
else
    echo -e "${RED}⚠ High or Critical vulnerabilities found in backend dependencies! Review the audit log above.${NC}"
fi
cd ..
echo ""

echo -e "${YELLOW}[3/5] Running Frontend Linting (Code Quality & Security Rules)...${NC}"
cd frontend || exit 1
if npm run lint; then
    echo -e "${GREEN}✓ Frontend linting passed.${NC}"
else
    echo -e "${RED}⚠ Linter found issues in the frontend code. This might include security bad-practices.${NC}"
fi
cd ..
echo ""

echo -e "${YELLOW}[4/5] Checking Backend TypeScript strictness (Type checking)...${NC}"
cd backend || exit 1
if npx tsc --noEmit; then
    echo -e "${GREEN}✓ Backend TypeScript types are valid.${NC}"
else
    echo -e "${RED}⚠ TypeScript errors found in the backend. Type errors can sometimes lead to runtime vulnerabilities.${NC}"
fi
cd ..
echo ""

echo -e "${YELLOW}[5/5] Scanning for Accidental Secret Leaks (Hardcoded passwords/tokens/keys)...${NC}"
# Simple scan for keywords that usually indicate leaked secrets
LEAKS=$(grep -rE "(API_KEY|SECRET_|PASSWORD|TOKEN|BEGIN RSA|AWS_ACCESS_KEY)[[:blank:]]*[:=][[:blank:]]*[\"'][A-Za-z0-9_=-]{10,}[\"']" \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude-dir=.next \
    --exclude-dir=dist \
    --exclude=package-lock.json \
    --exclude=security-test.sh \
    --exclude=.env \
    --exclude=README.md \
    . || true)

# Also check if any .env files are accidentally tracked by Git
ENV_TRACKED=$(git ls-files | grep -E "\.env$" || true)

if [ -n "$LEAKS" ]; then
    echo -e "${RED}⚠ POTENTIAL SECRETS HARDCODED IN CODEBASE!${NC}"
    echo "$LEAKS"
    echo -e "${RED}Please move these to environment variables (.env files) immediately.${NC}"
else
    echo -e "${GREEN}✓ No obvious hardcoded secrets detected in source files.${NC}"
fi

if [ -n "$ENV_TRACKED" ]; then
    echo -e "${RED}⚠ POTENTIAL SECRETS LEAKED: You are tracking an environment file (.env) in Git!${NC}"
    echo "$ENV_TRACKED"
    echo -e "${RED}Run 'git rm --cached <file>' and add it to .gitignore.${NC}"
else
    echo -e "${GREEN}✓ No .env files are being tracked by Git.${NC}"
fi
echo ""

echo -e "${BLUE}=== Audit Completed ===${NC}"
echo -e "Recommendation before publish:"
echo -e "1. Run '${GREEN}npm audit fix${NC}' if you had high vulnerabilities."
echo -e "2. Check the code for 'TODO' or 'FIXME' statements regarding security."
echo -e "3. Make sure 'bcrypt' and 'jsonwebtoken' usage is up-to-date in your backend auth."
