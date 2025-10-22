# Contributing to AWS Vibe Starter

Thank you for considering contributing to AWS Vibe Starter! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/yourusername/aws-vibe-starter.git`
3. Create a branch: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Run tests: `make test`
6. Commit your changes: `git commit -am 'Add new feature'`
7. Push to your fork: `git push origin feature/your-feature-name`
8. Create a Pull Request

## Development Setup

```bash
# Install dependencies
make install

# Start services
make up

# Run tests
make test

# View logs
make logs
```

## Code Style

- Use TypeScript for all new code
- Follow existing code formatting
- Add JSDoc comments for public APIs
- Keep functions small and focused
- Use meaningful variable names

## Testing

- Add tests for new features
- Ensure all tests pass before submitting PR
- Test both serverless and containers blueprints

## Commit Messages

- Use clear, descriptive commit messages
- Start with a verb (Add, Fix, Update, etc.)
- Reference issues when applicable

Examples:
- `Add support for custom domains`
- `Fix Bedrock error handling`
- `Update README with deployment instructions`

## Pull Request Process

1. Update README.md with details of changes if needed
2. Update CHANGELOG.md with notable changes
3. Ensure all tests pass
4. Request review from maintainers
5. Address review feedback

## Reporting Bugs

Use GitHub Issues and include:
- Clear description of the bug
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Docker version, etc.)
- Error logs

## Suggesting Enhancements

Use GitHub Issues with the "enhancement" label and include:
- Clear description of the enhancement
- Use cases and benefits
- Proposed implementation (if any)

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on what's best for the community

## Questions?

Open a GitHub Discussion or reach out to the maintainers.

Thank you for contributing! 🎉
